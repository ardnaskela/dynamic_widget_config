import { Component, AfterViewInit, ElementRef } from '@angular/core';
import { JSONEditor } from '@json-editor/json-editor';
import { inferSchema } from '@jsonhero/schema-infer';
import { environment } from '../../environment/environment';
import firebase from 'firebase/compat/app';
import 'firebase/compat/storage';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-editor',
  template:
    '<div id="editor"></div> <button class="btn btn-success" *ngIf="isContentLoaded" (click)="save()">Salva</button>',
  standalone: true,
  styleUrl: 'editor.component.css',
  imports: [CommonModule],
})
export class EditorComponent implements AfterViewInit {
  editor: any;
  widgetName: string = 'demo_widget';
  storage: firebase.storage.Storage;
  isContentLoaded: boolean = false;

  constructor(private cdr: ChangeDetectorRef) {
    firebase.initializeApp(environment.firebaseConfig);
    this.storage = firebase.storage();
  }

  ngAfterViewInit() {
    const auth = getAuth();
    signInAnonymously(auth)
      .then(() => {
        const container = document.getElementById('editor');
        const schemaPath =
          'dynamic_widgets/' + this.widgetName + '_schema.json';
        this.storage
          .ref(schemaPath)
          .getDownloadURL()
          .catch(() => {
            // If the schema file doesn't exist, generate and upload it
            fetch('dynamic_widgets/' + this.widgetName + '.json')
              .then((response) => response.json())
              .then((object) => {
                const schema = inferSchema(object).toJSONSchema();
                const optionalSchema = this.makeAllFieldsOptional(schema);
                const file = this.storage.ref(schemaPath);
                file.putString(JSON.stringify(optionalSchema, null, 2));
              });
          })
          .finally(() => {
            Promise.all([
              this.storage
                .ref('dynamic_widgets/' + this.widgetName + '.json')
                .getDownloadURL(),
              this.storage.ref(schemaPath).getDownloadURL(),
            ]).then(([objectUrl, schemaUrl]) => {
              Promise.all([
                fetch(objectUrl).then((response) => response.json()),
                fetch(schemaUrl).then((response) => response.json()),
              ]).then(([object, schema]) => {
                const config = {
                  use_name_attributes: false,
                  theme: 'spectre',
                  iconlib: 'spectre',
                  disable_edit_json: false,
                  disable_properties: false,
                  disable_collapse: false,
                  expand_height: true,
                  compact: true,
                  remove_empty_properties: true,
                  array_controls_top: true,
                  schema: schema,
                };
                JSONEditor.defaults.editors.object.options.collapsed = true;
                JSONEditor.defaults.editors.array.options.collapsed = true;
                this.editor = new JSONEditor(container, config).on(
                  'ready',
                  () => {
                    this.editor.setValue(object);
                    setTimeout(() => {
                      this.isContentLoaded = true;
                      this.cdr.detectChanges(); // Force change detection
                    }, 0);
                  }
                );
              });
            });
          });
      })
      .catch((error) => {
        var errorCode = error.code;
        var errorMessage = error.message;
        console.error(errorCode, errorMessage);
      });
  }

  makeAllFieldsOptional(schema: any): any {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    if (schema['type'] === 'array' && schema['items']) {
      if (schema['items']['type'] === 'object') {
        schema['format'] = 'tabs-top';
        schema['items']['headerTemplate'] = '{{ self.type }}';
        schema['items']['options'] = {
          collapsed: false,
        };
      } else schema['format'] = 'table';
    }

    if (Array.isArray(schema)) {
      var toReturn = schema.map(this.makeAllFieldsOptional);
      return toReturn;
    }

    const newSchema: any = {};
    for (const key in schema) {
      if (key !== 'required') {
        newSchema[key] = this.makeAllFieldsOptional(schema[key]);
      }
    }

    return newSchema;
  }

  save() {
    const schema = this.makeAllFieldsOptional(
      inferSchema(this.editor.getValue()).toJSONSchema()
    );
    const task = this.storage
      .ref('dynamic_widgets/' + this.widgetName + '.json')
      .putString(
        JSON.stringify(this.editor.getValue()),
        firebase.storage.StringFormat.RAW
      );
    task.on('state_changed', {
      complete: () => {
        this.storage
          .ref('dynamic_widgets/' + this.widgetName + '_schema.json')
          .putString(JSON.stringify(schema), firebase.storage.StringFormat.RAW)
          .then(() => {
            this.showToast('Salvataggio completato!', 'toast toast-success');
          })
          .catch((error) => {
            this.showToast(
              'Errore nel salvataggio: ' + error.message,
              'toast toast-error'
            );
          });
      },
    });
  }

  showToast(message: string, className: string) {
    const toast = document.createElement('div');
    toast.className = className;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 2000);
  }
}
