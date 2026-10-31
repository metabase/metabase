import type { ReactNode } from "react";
import { t } from "ttag";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/content-translation/plugins";
import { ActionIcon, Flex, Icon, Stack, Text } from "metabase/ui";

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
    <Stack px="xl" pt="xl" gap="xl">
      <Flex align="center" gap="md">
        {onBack && !readOnly && (
          <ActionIcon
            variant="default"
            size="sm"
            aria-label={t`Back`}
            onClick={onBack}
          >
            <Icon name="chevronleft" />
          </ActionIcon>
        )}
        <Text fw="bold" lh="1.125rem">
          {PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
            displayName: columnName,
            tc,
            locale,
          })}
        </Text>
      </Flex>
      {children}
    </Stack>
  );
}
