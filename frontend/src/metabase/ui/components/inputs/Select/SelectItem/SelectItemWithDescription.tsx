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
      <SelectItem ref={ref} selected={selected} {...props}>
        {showCheckIcon && <Icon name={selected ? "check" : "empty"} />}

        <Flex direction="column" flex="1" gap="xs">
          <Text c="inherit" fw="bold" lh="1rem">
            {label}
          </Text>

          {description && (
            <Text c="text-disabled" className={S.description} lh="1rem">
              {description}
            </Text>
          )}
        </Flex>
      </SelectItem>
    );
  },
);
