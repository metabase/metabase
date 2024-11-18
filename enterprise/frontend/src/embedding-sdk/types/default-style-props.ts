import type { CSSProperties, HTMLProps } from "react";

export type PropsWithHTMLStyle<
  T extends Record<string, any> = NonNullable<Record<string, any>>,
> = {
  className?: HTMLProps<HTMLElement>["className"];
  style?: CSSProperties;
} & T;
