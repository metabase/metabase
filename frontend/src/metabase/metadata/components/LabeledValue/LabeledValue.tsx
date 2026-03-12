import { type ReactNode, useId } from "react";

import { Badge, Stack, Text } from "metabase/ui";

interface Props {
  children?: ReactNode;
  label: string;
}

export const LabeledValue = ({ children, label }: Props) => {
  const id = useId();

  return (
    <Stack gap="sm">
      <Text c="text-primary" component="label" fw="bold" id={id}>
        {label}
      </Text>

      <Badge
        aria-labelledby={id}
        bg="accent-gray-light"
        c="text-primary"
        fw="normal"
        h={32}
        p="sm"
        radius="md"
        size="lg"
        tt="none"
        variant="default"
      >
        {children}
      </Badge>
    </Stack>
  );
};
