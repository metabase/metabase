import { Notification } from "@mantine/core"; // FIXME
import { t } from "ttag";

import { Icon, Text } from "metabase/ui";

export const ReadOnlyNotice = () => {
  return (
    <Notification
      withBorder
      icon={<Icon name="lock" />}
      styles={{ root: { boxShadow: "none", border: "1px solid var(--mb-color-border)" } }}
      p="md"
    >
      <Text fz="md">
        {t`This item is in the library, and can only be edited via git`}
      </Text>
    </Notification>
  );
}
