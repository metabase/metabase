import type { CSSProperties, ReactNode } from "react";

import type { CommonStylingProps } from "embedding-sdk-bundle/types/props";

/**
 * Props for the MetabotChat component.
 *
 * @interface
 * @expand
 * @category MetabotChat
 */
export interface MetabotChatProps extends CommonStylingProps {
  /**
   * A number or string specifying a CSS size value that specifies the height of the component.
   */
  height?: CSSProperties["height"];

  /**
   * A number or string specifying a CSS size value that specifies the width of the component.
   */
  width?: CSSProperties["width"];

  /**
   * Custom content to render inside the chat panel.
   * When provided, overrides the default chat layout.
   */
  children?: ReactNode;
}

/**
 * Props for the MetabotChat.FloatingActionButton trigger.
 *
 * @interface
 * @expand
 * @category MetabotChat
 */
export interface MetabotFloatingActionButtonProps extends CommonStylingProps {
  /**
   * A number or string specifying a CSS size value that specifies the height of the chat panel.
   * @default 500
   */
  panelHeight?: CSSProperties["height"];

  /**
   * A number or string specifying a CSS size value that specifies the width of the chat panel.
   * @default 400
   */
  panelWidth?: CSSProperties["width"];

  /**
   * Custom content to render inside the chat panel.
   * When provided, overrides the default chat layout.
   */
  children?: ReactNode;
}

/**
 * Props for the MetabotChat.CommandBar trigger.
 *
 * @interface
 * @expand
 * @category MetabotChat
 */
export interface MetabotCommandBarProps extends CommonStylingProps {
  /**
   * A number or string specifying a CSS size value that specifies the height of the expanded chat panel.
   * @default 400
   */
  panelHeight?: CSSProperties["height"];

  /**
   * A number or string specifying a CSS size value that specifies the width of the command bar.
   * @default 600
   */
  width?: CSSProperties["width"];

  /**
   * Custom content to render inside the chat panel.
   * When provided, overrides the default chat layout.
   */
  children?: ReactNode;
}
