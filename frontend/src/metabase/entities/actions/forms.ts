import { t } from "ttag";

export const saveForm = {
  fields: [
    {
      name: "name",
      title: t`Name`,
      placeholder: t`My new fantastic action`,
      autoFocus: true,
      validate: (name: string) =>
        (!name && t`Name is required`) ||
        (name && name.length > 100 && t`Name must be 100 characters or less`),
    },
    {
      name: "description",
      title: t`Description`,
      type: "text",
      placeholder: t`It's optional but oh, so helpful`,
      normalize: (description: string) => description || null, // expected to be nil or non-empty string
    },
    {
      name: "collection_id",
      title: t`Collection it's saved in`,
      type: "collection",
    },
    {
      name: "question",
      type: "hidden",
    },
    {
      name: "formSettings",
      type: "hidden",
    },
  ],
};
