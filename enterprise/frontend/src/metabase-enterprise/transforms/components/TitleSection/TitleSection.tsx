import type { ReactNode } from "react";

import { Group, Stack, Title } from "metabase/ui";

type TitleSectionProps = {
  label: string;
  rightSection?: ReactNode;
  children?: ReactNode;
};

export function TitleSection({
  label,
  rightSection,
  children,
}: TitleSectionProps) {
  return (
    <Stack>
      <Group>
        <Title flex={1} order={4}>
          {label}
        </Title>
        {rightSection}
      </Group>
      {children}
    </Stack>
  );
}
