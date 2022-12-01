import { t } from "ttag";

function createNameField() {
  return {
    name: "name",
    title: t`Name`,
    placeholder: t`My new fantastic app`,
    autoFocus: true,
    validate: (name?: string) =>
      (!name && t`Name is required`) ||
      (name && name.length > 100 && t`Name must be 100 characters or less`),
  };
}

function createDescriptionField() {
  return {
    name: "description",
    title: t`Description`,
    type: "text",
    placeholder: t`It's optional but oh, so helpful`,
    normalize: (description?: string) => description || null,
  };
}

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
