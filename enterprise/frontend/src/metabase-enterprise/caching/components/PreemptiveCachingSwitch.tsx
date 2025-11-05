import { useFormikContext } from "formik";
import { t } from "ttag";

import type { PreemptiveCachingSwitchProps } from "metabase/plugins";
import { Switch } from "metabase/ui";
import type { DurationStrategy, ScheduleStrategy } from "metabase-types/api";

export const PreemptiveCachingSwitch = ({
  handleSwitchToggle,
}: PreemptiveCachingSwitchProps) => {
  const { values } = useFormikContext<DurationStrategy | ScheduleStrategy>();
  const currentRefreshValue = values.refresh_automatically ?? false;
  return (
    <Switch
      checked={currentRefreshValue}
      onChange={handleSwitchToggle}
      role="switch"
      size="sm"
      label={t`Refresh cache automatically`}
      description={t`As soon as cached results expire, run and cache the query again to update the results and refresh
        the cache.`}
      styles={{
        labelWrapper: { paddingLeft: "16px" },
        label: { fontWeight: "bold" },
      }}
      wrapperProps={{
        "data-testid": "preemptive-caching-switch",
      }}
    />
  );
};
