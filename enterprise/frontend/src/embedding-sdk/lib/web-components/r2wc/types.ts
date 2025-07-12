import type { transforms } from "./transforms/transforms";

export type R2wcPropTransformType = keyof typeof transforms;

export type R2wcPropTypes<TComponentProps> = Record<
  keyof TComponentProps,
  R2wcPropTransformType
>;
