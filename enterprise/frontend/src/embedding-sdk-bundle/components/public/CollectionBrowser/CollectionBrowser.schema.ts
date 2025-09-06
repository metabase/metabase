import {
  any,
  function as functionSchema,
  optional,
  strictObject,
} from "zod/mini";
import type { infer as zInfer } from "zod/v4/core/core";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { CollectionBrowserProps } from "./CollectionBrowser";

const rawPropsSchema = strictObject({
  EmptyContentComponent: optional(any()),
  className: optional(any()),
  collectionId: optional(any()),
  onClick: optional(any()),
  pageSize: optional(any()),
  style: optional(any()),
  visibleColumns: optional(any()),
  visibleEntityTypes: optional(any()),
});
const propsSchema: ValidateInferredSchema<
  CollectionBrowserProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const collectionBrowserPropsSchema = functionSchema({
  input: [propsSchema],
});
