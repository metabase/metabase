import { Stack, Title } from "metabase/ui";

import S from "../TableSection.module.css";

export function TableSectionGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="md" className={S.box}>
      {title && (
        <Title order={4} fz="sm" c="text-secondary">
          {title}
        </Title>
      )}
      {children}
    </Stack>
  );
}
