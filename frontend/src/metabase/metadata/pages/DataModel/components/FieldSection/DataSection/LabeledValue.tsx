import type { ReactNode } from "react";

import { Badge, Stack, Text } from "metabase/ui";

interface Props {
  children?: ReactNode;
  label: string;
}

export const LabeledValue = ({ children, label }: Props) => {
  return (
    <Stack gap="sm">
      <Text c="text-primary" component="label" fw="bold">
        {label}
      </Text>

      <Badge
        bg="accent-gray-light"
        c="text-primary"
        fw="normal"
        h={32}
        p="sm"
        radius="md"
        size="lg"
        variant="default"
      >
        {children}
      </Badge>
    </Stack>
  );
};
