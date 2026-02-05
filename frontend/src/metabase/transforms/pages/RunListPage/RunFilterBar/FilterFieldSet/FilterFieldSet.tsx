import {
  type FieldsetHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  forwardRef,
} from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Group,
  Icon,
  type IconName,
  Text,
  Tooltip,
} from "metabase/ui";

import S from "./FilterFieldSet.module.css";

type FilterButtonProps = FieldsetHTMLAttributes<HTMLFieldSetElement> & {
  label: string;
  icon: IconName;
  displayValue: ReactNode | null;
  onRemove: () => void;
};

export const FilterFieldSet = forwardRef(function FilterWidget(
  { label, icon, displayValue, onRemove, ...props }: FilterButtonProps,
  ref: Ref<HTMLFieldSetElement>,
) {
  const hasValue = displayValue != null;

  const handleRemove = (event: MouseEvent) => {
    // do not toggle the widget on the remove button click
    event.stopPropagation();
    onRemove?.();
  };

  return (
    <Box
      component="fieldset"
      {...props}
      ref={ref}
      className={S.fieldset}
      pl="md"
      pr="xs"
      py="xs"
      bg="background-primary"
      aria-label={label}
    >
      {hasValue && (
        <Box component="legend" h="2px" ml="-4px" px="xs" fz="sm" lh={0}>
          {label}
        </Box>
      )}
      <Group c="text-secondary" gap="sm">
        {hasValue ? (
          <>
            <Text flex={1} fw="bold">
              {displayValue}
            </Text>
            <Tooltip label={t`Remove filter`}>
              <ActionIcon aria-label={t`Remove filter`} onClick={handleRemove}>
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          </>
        ) : (
          <>
            <Icon name={icon} />
            <Text flex={1}>{label}</Text>
            <ActionIcon aria-label={t`Open filter widget`}>
              <Icon name="chevrondown" />
            </ActionIcon>
          </>
        )}
      </Group>
    </Box>
  );
});
