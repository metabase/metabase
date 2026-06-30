import { type ReactNode, useId } from "react";

import { Badge, Stack, Text } from "metabase/ui";

import S from "./LabeledValue.module.css";

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
        classNames={{ root: S.badge, label: S.badgeLabel }}
        fw="normal"
        p="sm"
        radius="md"
        size="lg"
        tt="none"
        variant="default"
        lh="sm"
      >
        {children}
      </Badge>
    </Stack>
  );
};
