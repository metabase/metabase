import type { ReactNode } from "react";

import { Stack, type StackProps, Text, rem } from "metabase/ui";

interface AboutSubSectionProps {
  title: string;
  children: ReactNode;
  mt?: StackProps["mt"];
}

export function AboutSubSection({ title, children, mt }: AboutSubSectionProps) {
  return (
    <Stack gap="sm" mt={mt}>
      <Text fz="sm" lh={rem(16)} fw={400} c="text-secondary">
        {title}
      </Text>
      {children}
    </Stack>
  );
}
