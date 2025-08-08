import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type Ref,
  forwardRef,
} from "react";

import {
  ActionIcon,
  Group,
  Icon,
  type IconName,
  Text,
  UnstyledButton,
} from "metabase/ui";

import S from "./FilterButton.module.css";

type FilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: IconName;
  canRemove?: boolean;
  onRemove?: () => void;
};

export const FilterButton = forwardRef(function FilterWidget(
  { label, icon, canRemove, onRemove, ...props }: FilterButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const handleRemove = (event: MouseEvent) => {
    event.stopPropagation();
    onRemove?.();
  };

  return (
    <UnstyledButton {...props} ref={ref} className={S.button}>
      <Group c="text-secondary" h="2.5rem" gap="sm" pl="md" pr="xs">
        <Icon name={icon} />
        <Text flex={1}>{label}</Text>
        {canRemove ? (
          <ActionIcon onClick={handleRemove}>
            <Icon name="close" />
          </ActionIcon>
        ) : (
          <ActionIcon>
            <Icon name="chevrondown" />
          </ActionIcon>
        )}
      </Group>
    </UnstyledButton>
  );
});
