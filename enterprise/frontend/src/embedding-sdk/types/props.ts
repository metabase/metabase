import type { CSSProperties } from "react";

export type CommonElementProps = {
  /**
   * A custom class name to be added to the root element.
   */
  className?: string;

  /**
   * A custom style object to be added to the root element.
   */
  style?: CSSProperties;
};
