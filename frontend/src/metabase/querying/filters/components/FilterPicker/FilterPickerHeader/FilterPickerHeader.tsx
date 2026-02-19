import type { ReactNode } from "react";

import { useLocale } from "metabase/common/hooks";
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
  const { locale } = useLocale();
  return (
    <Flex px="md" pt="md" justify="space-between">
      {onBack && (
        <PopoverBackButton
          pr="md"
          onClick={onBack}
          disabled={readOnly}
          withArrow={!readOnly}
        >
          {PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
            displayName: columnName,
            tc,
            locale,
          })}
        </PopoverBackButton>
      )}
      {children}
    </Flex>
  );
}
