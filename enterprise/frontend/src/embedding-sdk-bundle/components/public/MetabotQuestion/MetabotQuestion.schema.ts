import type { CSSProperties } from "react";
import * as Yup from "yup";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";
import type { FunctionSchema } from "embedding-sdk-bundle/types/schema";

export interface MetabotQuestionProps extends CommonStylingProps {
  /**
   * Layout mode for the MetabotQuestion component
   */
  layout?: "auto" | "sidebar" | "stacked";

  /**
   * A number or string specifying a CSS size value that specifies the height of the component
   */
  height?: CSSProperties["height"];

  /**
   * A number or string specifying a CSS size value that specifies the width of the component
   */
  width?: CSSProperties["width"];
}

const propsSchema: Yup.SchemaOf<MetabotQuestionProps> = Yup.object({
  height: Yup.mixed().optional(),
  width: Yup.mixed().optional(),
  className: Yup.string().optional(),
  style: Yup.object().optional(),
  layout: Yup.mixed<"auto" | "sidebar" | "stacked">()
    .oneOf(["auto", "sidebar", "stacked"])
    .optional(),
});

export const metabotQuestionSchema: FunctionSchema = {
  input: [propsSchema],
};
