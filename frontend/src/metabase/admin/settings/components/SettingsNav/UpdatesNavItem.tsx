import { t } from "ttag";

import { useGetVersionInfoQuery } from "metabase/api";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { newVersionAvailable } from "metabase/lib/utils";
import { Badge } from "metabase/ui";

import { getCurrentVersion } from "../../selectors";

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
      label={<div>{t`Updates`}</div>}
      icon="sparkles"
      rightSection={
        isNewVersionAvailable ? (
          <Badge
            data-testid="updates-nav-badge"
            styles={{
              root: {
                color: "var(--mb-color-text-white)",
                backgroundColor: "var(--mb-color-error)",
              },
            }}
          >
            1
          </Badge>
        ) : null
      }
    />
  );
}
