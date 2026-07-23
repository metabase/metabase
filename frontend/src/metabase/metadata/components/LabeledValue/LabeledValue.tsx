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
        classNames={{ root: S.badge, label: S.badgeLabel }}
        size="sm"
        variant="light"
      >
        {children}
      </Badge>
    </Stack>
  );
};
