import { type ReactNode, useId } from "react";

import CS from "metabase/css/core/index.css";
import { Box, Stack } from "metabase/ui";

import S from "./SidebarInfoRow.module.css";

type SidebarInfoRowProps = {
  label: string;
  children?: ReactNode;
};

export function SidebarInfoRow({ label, children }: SidebarInfoRowProps) {
  const labelId = useId();

  return (
    <Stack
      className={S.row}
      p="md"
      gap="xs"
      role="group"
      aria-labelledby={labelId}
    >
      <Box
        id={labelId}
        className={CS.textWrap}
        c="text-secondary"
        fz="sm"
        lh="h5"
      >
        {label}
      </Box>
      <Box lh="h4">{children}</Box>
    </Stack>
  );
}
