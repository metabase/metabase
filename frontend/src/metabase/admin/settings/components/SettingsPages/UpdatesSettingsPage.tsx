import cx from "classnames";
import { c, t } from "ttag";

import { UpsellHostingUpdates } from "metabase/admin/upsells";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Box, Flex } from "metabase/ui";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { VersionUpdateNotice } from "../widgets/VersionUpdateNotice";

export function UpdatesSettingsPage() {
  const isHosted = useSetting("is-hosted?");
  const checkForUpdates = useSetting("check-for-updates");
  return (
    <Flex justify="space-between" data-testid="settings-updates">
      <div style={{ width: "585px" }}>
        {!isHosted && (
          <ul>
            <Box p="0.5rem 1rem 2rem">
              <AdminSettingInput
                name="check-for-updates"
                title={t`Check for updates`}
                description={t`Identify when new versions of Metabase are available.`}
                inputType="boolean"
              />
            </Box>
            {checkForUpdates && (
              <Box p="0.5rem 1rem 2rem">
                <AdminSettingInput
                  name="update-channel"
                  title={t`Types of releases to check for`}
                  description={t`We'll notify you here when there's a new version of this type of release.`}
                  options={[
                    {
                      label: c("describes a set of software version releases")
                        .t`Stable releases`,
                      value: "latest",
                    },
                    {
                      label: c("describes a set of software version releases")
                        .t`Beta releases`,
                      value: "beta",
                    },
                    {
                      label: c("describes a set of software version releases")
                        .t`Nightly builds`,
                      value: "nightly",
                    },
                  ]}
                  inputType="select"
                />
              </Box>
            )}
          </ul>
        )}
        {checkForUpdates && (
          <div className={CS.px2}>
            <div
              className={cx(CS.pt3, {
                [CS.borderTop]: !isHosted,
              })}
            >
              <VersionUpdateNotice />
            </div>
          </div>
        )}
      </div>
      <div>
        <UpsellHostingUpdates source="settings-updates-migrate_to_cloud" />
      </div>
    </Flex>
  );
}
