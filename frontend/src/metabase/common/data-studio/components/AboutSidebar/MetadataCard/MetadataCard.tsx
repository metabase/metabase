import type { ReactNode } from "react";

import { Paper, Stack, rem } from "metabase/ui";

import S from "./MetadataCard.module.css";

interface MetadataCardProps {
  children: ReactNode;
}

export function MetadataCard({ children }: MetadataCardProps) {
  return (
    <Paper className={S.card}>
      <Stack gap={rem(12)} className={S.rows}>
        {children}
      </Stack>
    </Paper>
  );
}
