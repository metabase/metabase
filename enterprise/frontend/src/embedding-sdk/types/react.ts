import type { FC } from "react";

export type SdkFunctionalComponent<
  // eslint-disable-next-line
  P = {},
> = (props: P) => ReturnType<FC>;
