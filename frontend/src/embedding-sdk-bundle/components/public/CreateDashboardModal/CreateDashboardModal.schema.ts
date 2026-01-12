import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { CreateDashboardModalProps } from "./CreateDashboardModal";

const propsSchema: Yup.SchemaOf<CreateDashboardModalProps> = Yup.object({
  initialCollectionId: Yup.mixed().optional(),
  isOpen: Yup.mixed().optional(),
  onClose: Yup.mixed().optional(),
  onCreate: Yup.object().required(),
}).noUnknown();

export const createDashboardModalSchema: FunctionSchema = {
  input: [propsSchema],
};
