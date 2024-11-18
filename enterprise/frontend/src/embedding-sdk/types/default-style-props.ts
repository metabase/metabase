import type { CSSProperties } from "react";

export type PropsWithHTMLStyle<
  T extends Record<string, any> = NonNullable<Record<string, any>>,
> = {
  className?: string;
  style?: CSSProperties;
} & T;
