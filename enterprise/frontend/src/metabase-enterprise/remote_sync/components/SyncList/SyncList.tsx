import type { ReactNode } from "react";

import { Box } from "metabase/ui";

import S from "./SyncList.module.css";

interface SyncListProps {
  children: ReactNode;
}

export const SyncList = ({ children }: SyncListProps) => (
  <Box className={S.syncList}>{children}</Box>
);
