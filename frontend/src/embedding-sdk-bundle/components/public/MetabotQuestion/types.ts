import type { CSSProperties } from "react";

import type { SdkCollectionId } from "embedding-sdk-bundle/types/collection";
import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";

/**
 * Props for the MetabotQuestion component.
 *
 * @interface
 * @expand
 * @category MetabotQuestion
 */
export interface MetabotQuestionProps extends CommonStylingProps {
  /**
   * Layout for the MetabotQuestion component.
   *
   * - `auto` (default): Metabot uses the `stacked` layout on mobile screens, and a `sidebar` layout on larger screens.
   * - `stacked`: the question visualization stacks on top of the chat interface.
   * - `sidebar`: the question visualization appears to the left of the chat interface, which is on a sidebar on the right.
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

  /**
   * Whether to show the save button.
   */
  isSaveEnabled?: boolean;

  /**
   * The collection to save the question to. This will hide the collection picker from the save modal.
   */
  targetCollection?: SdkCollectionId;
}
