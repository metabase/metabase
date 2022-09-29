import { createNameField, createDescriptionField } from "../collections/forms";

export function createNewAppForm() {
  return [createNameField(), createDescriptionField()];
}

export function createAppSettingsForm() {
  return [
    {
      ...createNameField(),
      name: "collection.name",
    },
    {
      ...createDescriptionField(),
      name: "collection.description",
    },
    {
      name: "collection_id",
      type: "hidden",
    },
  ];
}
