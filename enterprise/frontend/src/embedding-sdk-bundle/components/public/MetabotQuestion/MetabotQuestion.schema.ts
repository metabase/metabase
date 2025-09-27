import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

export interface MetabotQuestionProps {
  height?: string | number;
  layout?: "auto" | "sidebar" | "stacked";
}

const propsSchema: Yup.SchemaOf<MetabotQuestionProps> = Yup.object({
  height: Yup.mixed().optional(),
  layout: Yup.mixed<"auto" | "sidebar" | "stacked">()
    .oneOf(["auto", "sidebar", "stacked"])
    .optional(),
});

export const metabotQuestionSchema: FunctionSchema = {
  input: [propsSchema],
};
