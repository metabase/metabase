import { t } from "ttag";

import { getCurrentVersion } from "metabase/admin/app/selectors";
import { useGetVersionInfoQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { newVersionAvailable } from "metabase/lib/utils";
import { Indicator } from "metabase/ui";

import { SettingsNavItem } from "./SettingsNav";

export function UpdatesNavItem() {
  const { data: versionInfo } = useGetVersionInfoQuery();
  const currentVersion = useSelector(getCurrentVersion);
  const updateChannel = useSetting("update-channel") ?? "latest";
  const latestVersion = versionInfo?.[updateChannel]?.version;

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
              transform: "translateX(0.5rem)",
            },
          }}
          color="error"
          size={6}
          w="fit-content"
        >{t`Updates`}</Indicator>
      }
      icon="sparkles"
    />
  );
}
