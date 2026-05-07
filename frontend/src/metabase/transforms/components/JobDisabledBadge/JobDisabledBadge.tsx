import { t } from "ttag";

import { Text, type TextProps } from "metabase/ui";

export function JobDisabledBadge({ textProps }: { textProps?: TextProps }) {
  return (
    <Text
      bg="warning"
      fz="sm"
      lh="1rem"
      bdrs="xs"
      px="sm"
      py="xs"
      fw="bold"
      {...textProps}
    >
      {t`Disabled`}
    </Text>
  );
}
