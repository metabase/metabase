import type { PropsWithChildren, ReactNode } from "react";

import { getWindow } from "embedding-sdk/sdk-shared/lib/get-window";

type Props = {
  ssrFallback: ReactNode;
};

export const ClientSideOnlyWrapper = ({
  children,
  ssrFallback,
}: PropsWithChildren<Props>) => (getWindow() ? children : ssrFallback);
