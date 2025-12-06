import { makeAutoObservable } from "mobx";
import { defineMetabaseAuthConfig } from "@metabase/embedding-sdk-react";
declare global {
  interface Window {
    forceStagedDataPicker: boolean;
  }
}

export type EmbeddingType = "sdk" | "eajs" | "interactive";
export type Component =
  | "new-question"
  | "question"
  | "dashboard"
  | "collection-browser";

export const store = makeAutoObservable({
  embeddingType: "sdk" as EmbeddingType,
  metabaseInstanceUrl: "http://localhost:3000",
  component: "new-question" as Component,
  dashboardIdString: "1",
  questionIdString: "1",
  get questionId(): number | string {
    const parsed = parseInt(this.questionIdString, 10);
    return isNaN(parsed) ? this.questionIdString : parsed;
  },
  get dashboardId(): number | string {
    // to handle entity ids and similar
    // we currently don't accept sequential ids passed as strings EMB-1097
    const parsed = parseInt(this.dashboardIdString, 10);
    return isNaN(parsed) ? this.dashboardIdString : parsed;
  },
  _forceStagedDataPicker: false,
  set forceStagedDataPicker(value: boolean) {
    this._forceStagedDataPicker = value;
    window.forceStagedDataPicker = value;
  },
  get forceStagedDataPicker() {
    return this._forceStagedDataPicker;
  },

  get authConfig() {
    return defineMetabaseAuthConfig({
      metabaseInstanceUrl: this.metabaseInstanceUrl,
    });
  },
});
