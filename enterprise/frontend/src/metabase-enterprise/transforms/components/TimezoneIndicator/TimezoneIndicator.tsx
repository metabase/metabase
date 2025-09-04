import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Icon } from "metabase/ui";

export function TimezoneIndicator() {
  const reportTimezone = useSetting("report-timezone-long");

  return (
    <Icon
      name="info_outline"
      size={16}
      tooltip={t`Timezone is ${reportTimezone}`}
      tooltipPosition="bottom"
    />
  );
}
