import { t } from "c-3po";

import { normal, getRandomColor } from "metabase/lib/colors";

export const name = "collections";
export const path = "/api/collection";

export const form = {
  fields: [
    {
      name: "name",
      type: "input",
      placeholder: "My new fantastic collection",
      validate: name =>
        (!name && t`Name is required`) ||
        (name.length > 100 && t`Name must be 100 characters or less`),
    },
    {
      name: "description",
      type: "text",
      placeholder: "It's optional but oh, so helpful",
      normalize: description => description || null, // expected to be nil or non-empty string
    },
    {
      name: "color",
      type: "color",
      initial: () => getRandomColor(normal),
      validate: color => !color && t`Color is required`,
    },
  ],
};
