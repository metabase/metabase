import type { PropsWithChildren } from "react";

import { Box } from "metabase/ui";

import MobileToolbarS from "./MobileToolbar.module.css";

type Props = PropsWithChildren<{
  "data-testid"?: string;
}>;

export const MobileToolbar = ({
  children,
  "data-testid": dataTestId,
}: Props) => (
  <Box className={MobileToolbarS.MobileToolbar} data-testid={dataTestId}>
    {children}
  </Box>
);
