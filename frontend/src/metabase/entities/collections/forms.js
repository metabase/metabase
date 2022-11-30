import { t } from "ttag";

import { color } from "metabase/lib/colors";

import { DEFAULT_COLLECTION_COLOR_ALIAS } from "./constants";

export function createNameField() {
  return {
    name: "name",
    title: t`Name`,
    placeholder: t`My new fantastic collection`,
    autoFocus: true,
    validate: name =>
      (!name && t`Name is required`) ||
      (name && name.length > 100 && t`Name must be 100 characters or less`),
  };
}

export function createDescriptionField() {
  return {
    name: "description",
    title: t`Description`,
    type: "text",
    placeholder: t`It's optional but oh, so helpful`,
    normalize: description => description || null, // expected to be nil or non-empty string
  };
}

function createForm({ extraFields = [] } = {}) {
  return {
    fields: (
      values = {
        color: color("brand"),
      },
    ) => [
      createNameField(),
      createDescriptionField(),
      {
        name: "color",
        title: t`Color`,
        type: "hidden",
        initial: () => color(DEFAULT_COLLECTION_COLOR_ALIAS),
        validate: color => !color && t`Color is required`,
      },
      {
        name: "parent_id",
        title: t`Collection it's saved in`,
        type: "collection",
      },
      ...extraFields,
    ],
  };
}

export const getFormSelector = () => createForm();
