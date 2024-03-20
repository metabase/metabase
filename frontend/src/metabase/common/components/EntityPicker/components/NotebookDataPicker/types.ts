import type { Database } from "metabase-types/api";

export type DatabasePickerItem = {
  description: Database["description"];
  id: Database["id"];
  name: Database["name"];
  model: "database";
};

// TODO: add QuestionPickerItem
// TODO: add ModelPickerItem if question is insufficient
export type NotebookDataPickerItem = DatabasePickerItem;
