import type { PropsWithChildren } from "react";

import { Button } from "metabase/ui";

import MobileToolbarS from "./MobileToolbar.module.css";

type Props = PropsWithChildren<{
  "data-testid"?: string;
}>;

export const MobileToolbar = ({
  children,
  "data-testid": dataTestId,
}: Props) => (
  <Button.Group
    className={MobileToolbarS.MobileToolbar}
    data-testid={dataTestId}
  >
    {children}
  </Button.Group>
);
