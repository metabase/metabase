import type { ReactNode } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { Flex, PopoverBackButton } from "metabase/ui";

interface FilterPickerHeaderProps {
  columnName: string;
  children?: ReactNode;
  onBack?: () => void;
}

export function FilterPickerHeader({
  columnName,
  children,
  onBack,
}: FilterPickerHeaderProps) {
  const tc = useTranslateContent();
  return (
    <Flex px="md" pt="md" justify="space-between">
      {onBack && (
        <PopoverBackButton pr="md" onClick={onBack}>
          {tc(columnName)}
        </PopoverBackButton>
      )}
      {children}
    </Flex>
  );
}
