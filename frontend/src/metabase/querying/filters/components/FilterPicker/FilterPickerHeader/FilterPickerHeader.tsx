import type { ReactNode } from "react";

import { Flex, PopoverBackButton } from "metabase/ui";

interface FilterPickerHeaderProps {
  columnName: string;
  children?: ReactNode;
  readOnly?: boolean;
  onBack?: () => void;
}

export function FilterPickerHeader({
  columnName,
  children,
  readOnly,
  onBack,
}: FilterPickerHeaderProps) {
  return (
    <Flex px="md" pt="md" justify="space-between">
      {onBack && (
        <PopoverBackButton
          pr="md"
          onClick={onBack}
          disabled={readOnly}
          withArrow={!readOnly}
        >
          {columnName}
        </PopoverBackButton>
      )}
      {children}
    </Flex>
  );
}
