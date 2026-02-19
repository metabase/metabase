import * as Yup from "yup";

import * as Errors from "metabase/lib/errors";

export const COLLECTION_FORM_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),
  parent_id: Yup.number().nullable().default(null),
});

export type CollectionFormValues = Yup.InferType<typeof COLLECTION_FORM_SCHEMA>;
