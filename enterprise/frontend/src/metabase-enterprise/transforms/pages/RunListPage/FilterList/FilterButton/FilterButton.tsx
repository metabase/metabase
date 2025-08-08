import { type ButtonHTMLAttributes, type Ref, forwardRef } from "react";

import { Group, Icon, type IconName, Text, UnstyledButton } from "metabase/ui";

import S from "./FilterButton.module.css";

type FilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: IconName;
};

export const FilterButton = forwardRef(function FilterWidget(
  { label, icon, ...props }: FilterButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  return (
    <UnstyledButton {...props} ref={ref} className={S.button}>
      <Group c="text-secondary" px="md" py="sm" gap="sm">
        <Icon name={icon} />
        <Text flex={1}>{label}</Text>
        <Icon name="chevrondown" />
      </Group>
    </UnstyledButton>
  );
});
