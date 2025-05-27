import type { FC } from "react";

/**
 * @hidden
 */
export type SdkFunctionalComponent<
  // eslint-disable-next-line
  P = {},
> = (props: P) => ReturnType<FC>;
