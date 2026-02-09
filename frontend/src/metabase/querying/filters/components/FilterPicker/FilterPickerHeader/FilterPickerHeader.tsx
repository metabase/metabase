import type { ReactNode } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
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
  const tc = useTranslateContent();
  return (
    <Flex px="md" pt="md" justify="space-between">
      {onBack && (
        <PopoverBackButton
          pr="md"
          onClick={onBack}
          disabled={readOnly}
          withArrow={!readOnly}
        >
          {PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName(
            columnName,
            tc,
          )}
        </PopoverBackButton>
      )}
      {children}
    </Flex>
  );
}
