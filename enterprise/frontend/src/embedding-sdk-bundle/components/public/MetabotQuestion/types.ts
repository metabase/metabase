import type { CSSProperties } from "react";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";

/**
 * @interface
 * @expand
 * @category InteractiveQuestion
 */
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
