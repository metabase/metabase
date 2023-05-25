import { ReactNode } from "react";

export type RenderProp<Props extends Record<string, unknown>> = (
  props: Props,
) => ReactNode;

export type RenderTriggerElement = (props: {
  isTriggeredComponentOpen: boolean;
  open: () => void;
  close: () => void;
}) => ReactNode;
