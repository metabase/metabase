import { ReactNode } from "react";

export type RenderProp<Props extends Record<string, unknown>> = (
  props: Props,
) => ReactNode;
