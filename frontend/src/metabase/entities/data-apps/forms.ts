import { createNameField, createDescriptionField } from "../collections/forms";

export function createForm() {
  return [createNameField(), createDescriptionField()];
}
