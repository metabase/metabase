import { t } from "c-3po";

import { normal, getRandomColor } from "metabase/lib/colors";

export const name = "collections";
export const path = "/api/collection";

export const form = {
  fields: [
    { name: "name", type: "input", placeholder: "My new fantastic collection" },
    {
      name: "description",
      type: "text",
      placeholder: "It's optional but oh, so helpful",
    },
    { name: "color", type: "color" },
  ],
  validate: values => {
    const errors = {};
    if (!values.name) {
      errors.name = t`Name is required`;
    } else if (values.name.length > 100) {
      errors.name = t`Name must be 100 characters or less`;
    }
    if (!values.color) {
      errors.color = t`Color is required`;
    }
    return errors;
  },
  getInitialValues: () => ({
    name: "",
    description: null,
    // pick a random color to start so everything isn't blue all the time
    color: getRandomColor(normal),
  }),
};
