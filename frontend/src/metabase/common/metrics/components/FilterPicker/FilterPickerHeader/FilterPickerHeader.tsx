import type { ReactNode } from "react";

import { Flex, PopoverBackButton } from "metabase/ui";

interface FilterPickerHeaderProps {
  dimensionName: string;
  children?: ReactNode;
  readOnly?: boolean;
  onBack?: () => void;
}

export function FilterPickerHeader({
  dimensionName,
  children,
  readOnly,
  onBack,
}: FilterPickerHeaderProps) {
  return (
    <Flex px="lg" pt="lg" justify="space-between">
      {onBack && (
        <PopoverBackButton
          pr="lg"
          onClick={onBack}
          disabled={readOnly}
          withArrow={!readOnly}
        >
          {dimensionName}
        </PopoverBackButton>
      )}
      {children}
    </Flex>
  );
}
