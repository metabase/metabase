import {
  any,
  function as functionSchema,
  nonoptional,
  optional,
  strictObject,
} from "zod/mini";
import type { infer as zInfer } from "zod/v4/core/core";

import type { ValidateInferredSchema } from "embedding-sdk-bundle/types/schema";

import type { CreateDashboardModalProps } from "./CreateDashboardModal";

const rawPropsSchema = strictObject({
  initialCollectionId: optional(any()),
  isOpen: optional(any()),
  onClose: optional(any()),
  onCreate: nonoptional(any()),
});
const propsSchema: ValidateInferredSchema<
  CreateDashboardModalProps,
  zInfer<typeof rawPropsSchema>
> = rawPropsSchema;

export const createDashboardModalSchema = functionSchema({
  input: [propsSchema],
});
