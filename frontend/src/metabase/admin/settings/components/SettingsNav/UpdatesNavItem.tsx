import { t } from "ttag";

import { getCurrentVersion } from "metabase/admin/app/selectors";
import { useGetVersionInfoQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { newVersionAvailable } from "metabase/lib/utils";
import { Indicator } from "metabase/ui";

import { SettingsNavItem } from "./SettingsNav";

export function UpdatesNavItem() {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const currentVersion = useSelector(getCurrentVersion);
  const latestVersion = versionInfo?.latest?.version;

  const isNewVersionAvailable =
    latestVersion && newVersionAvailable({ currentVersion, latestVersion });

  return (
    <SettingsNavItem
      path="updates"
      label={
        <Indicator
          data-testid="testing"
          disabled={!isNewVersionAvailable}
          styles={{
            indicator: {
              right: "0.5rem",
            },
          }}
          size={7}
          // position the indicator to the right - can't use rightSection because it rotates on click
          position="middle-end"
        >{t`Updates`}</Indicator>
      }
      icon="sparkles"
    />
  );
}
