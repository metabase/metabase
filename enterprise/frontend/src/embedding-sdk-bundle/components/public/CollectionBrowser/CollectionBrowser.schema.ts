import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { CollectionBrowserProps } from "./CollectionBrowser";

const propsSchema: Yup.SchemaOf<CollectionBrowserProps> = Yup.object({
  EmptyContentComponent: Yup.mixed().optional(),
  className: Yup.mixed().optional(),
  collectionId: Yup.mixed().optional(),
  onClick: Yup.mixed().optional(),
  pageSize: Yup.mixed().optional(),
  style: Yup.mixed().optional(),
  visibleColumns: Yup.mixed().optional(),
  visibleEntityTypes: Yup.mixed().optional(),
}).noUnknown();

export const collectionBrowserPropsSchema: FunctionSchema = {
  input: [propsSchema],
};
