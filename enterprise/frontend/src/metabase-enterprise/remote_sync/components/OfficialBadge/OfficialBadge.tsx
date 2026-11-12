import { t } from "ttag";

import {
  OFFICIAL_ICON_COLOR,
  OFFICIAL_ICON_NAME,
} from "metabase/common/collections/constants";
import type { OfficialBadgeProps } from "metabase/plugins";
import { Group, Icon, Text } from "metabase/ui";

import { isOfficial } from "../../utils";

export function OfficialBadge({
  collection,
  size = 16,
  showLabel = false,
}: OfficialBadgeProps) {
  if (!isOfficial(collection)) {
    return null;
  }

  if (!showLabel) {
    return (
      <Icon
        name={OFFICIAL_ICON_NAME}
        color={OFFICIAL_ICON_COLOR}
        size={size}
        tooltip={t`Official`}
        data-testid="official-badge"
      />
    );
  }

  return (
    <Group gap="sm" wrap="nowrap" data-testid="official-badge">
      <Icon name={OFFICIAL_ICON_NAME} color={OFFICIAL_ICON_COLOR} size={size} />
      <Text lh={1}>{t`Official`}</Text>
    </Group>
  );
}
