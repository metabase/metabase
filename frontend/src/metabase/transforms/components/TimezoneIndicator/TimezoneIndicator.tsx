import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { FixedSizeIcon } from "metabase/ui";

export function TimezoneIndicator() {
  const systemTimezone = useSetting("system-timezone");

  return (
    <FixedSizeIcon
      name="info_outline"
      size={16}
      tooltip={t`Timezone is ${systemTimezone}`}
      tooltipPosition="bottom"
    />
  );
}
