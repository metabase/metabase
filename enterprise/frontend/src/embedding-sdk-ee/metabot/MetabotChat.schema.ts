import * as Yup from "yup";

import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

import type { MetabotChatProps } from "embedding-sdk-bundle/components/public/MetabotChat/types";

const propsSchema: Yup.SchemaOf<MetabotChatProps> = Yup.object({
  height: Yup.mixed().optional(),
  width: Yup.mixed().optional(),
  className: Yup.string().optional(),
  style: Yup.object().optional(),
  children: Yup.mixed().optional(),
});

export const metabotChatSchema: FunctionSchema = { input: [propsSchema] };
