import type { ComponentProps, ElementType } from "react";

export type PropsWithHTMLAttributes<
  E extends ElementType = ElementType,
  T extends Record<string, any> = Record<never, never>,
> = ComponentProps<E> & T;
