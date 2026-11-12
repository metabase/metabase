import type { AriaAttributes, AriaRole, ReactNode } from "react";

import { Box } from "metabase/ui";

import S from "./DetailsTable.module.css";

type DetailsTableProps = {
  children: ReactNode;
  role?: AriaRole;
  "aria-label"?: AriaAttributes["aria-label"];
};

export const DetailsTable = ({ children, ...ariaProps }: DetailsTableProps) => (
  <Box
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="lg"
    className={S.detailsTable}
    {...ariaProps}
  >
    {children}
  </Box>
);
