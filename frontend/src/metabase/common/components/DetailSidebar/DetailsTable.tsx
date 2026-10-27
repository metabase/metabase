import type { ReactNode } from "react";

import { Box } from "metabase/ui";

import S from "./DetailsTable.module.css";

export const DetailsTable = ({ children }: { children: ReactNode }) => (
  <Box
    bd="1px solid var(--mb-color-border-neutral)"
    bdrs="lg"
    className={S.detailsTable}
  >
    {children}
  </Box>
);
