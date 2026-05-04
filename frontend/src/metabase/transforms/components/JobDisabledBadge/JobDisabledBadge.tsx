import { t } from "ttag";

import { Text } from "metabase/ui";

export function JobDisabledBadge() {
  return (
    <Text bg="warning" fz="sm" lh="1rem" bdrs="xs" px="sm" py="xs">
      {t`Disabled`}
    </Text>
  );
}
