import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

export interface MetabotQuestionProps {
  height?: string | number;
}

const propsSchema: Yup.SchemaOf<MetabotQuestionProps> = Yup.object({
  height: Yup.mixed().optional(),
});

export const metabotQuestionSchema: FunctionSchema = {
  input: [propsSchema],
};
