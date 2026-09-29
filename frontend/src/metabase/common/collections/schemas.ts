import * as Yup from "yup";

import * as Errors from "metabase/utils/errors";
import type { IconName } from "metabase-types/api";

export const COLLECTION_FORM_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),
  icon: Yup.mixed<IconName>().nullable().default(null),
  parent_id: Yup.number().nullable().default(null),
});

export type CollectionFormValues = Yup.InferType<typeof COLLECTION_FORM_SCHEMA>;
