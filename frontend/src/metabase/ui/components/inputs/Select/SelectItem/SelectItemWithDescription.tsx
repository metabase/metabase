import { type ReactNode, type Ref, forwardRef } from "react";

import { Flex, Icon, Text } from "metabase/ui";

import { SelectItem, type SelectItemProps } from "./SelectItem";
import S from "./SelectItemWithDescription.module.css";

export interface SelectItemWithDescriptionProps extends SelectItemProps {
  label: ReactNode;
  description?: ReactNode;
  showCheckIcon?: boolean;
}

export const SelectItemWithDescription = forwardRef(
  function SelectItemWithDescription(
    {
      label,
      description,
      showCheckIcon = true,
      selected,
      ...props
    }: SelectItemWithDescriptionProps,
    ref: Ref<HTMLDivElement>,
  ) {
    return (
      <SelectItem ref={ref} selected={selected} py="xxs" {...props}>
        {showCheckIcon && <Icon name={selected ? "check" : "empty"} />}

        <Flex direction="column" flex="1" gap="xxs">
          <Text c="inherit" lh="md">
            {label}
          </Text>

          {description && (
            <Text className={S.description} fz="sm" lh="sm">
              {description}
            </Text>
          )}
        </Flex>
      </SelectItem>
    );
  },
);
