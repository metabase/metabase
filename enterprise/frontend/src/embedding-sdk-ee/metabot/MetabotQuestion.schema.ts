import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { MetabotQuestionProps } from ".";

const propsSchema: Yup.SchemaOf<MetabotQuestionProps> = Yup.object({
  height: Yup.mixed().optional(),
  width: Yup.mixed().optional(),
  className: Yup.string().optional(),
  style: Yup.object().optional(),
  layout: Yup.mixed<"auto" | "sidebar" | "stacked">()
    .oneOf(["auto", "sidebar", "stacked"])
    .optional(),
});

export const metabotQuestionSchema: FunctionSchema = { input: [propsSchema] };
