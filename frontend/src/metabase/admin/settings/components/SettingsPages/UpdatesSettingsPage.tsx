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
      <Box w="36rem">
        {!isHosted && (
          <>
            <Box p="0.5rem 1rem 2rem">
              <AdminSettingInput
                name="check-for-updates"
                title={t`Check for updates`}
                inputType="boolean"
              />
            </Box>
            {checkForUpdates && (
              <Box p="0.5rem 1rem 2rem">
                <AdminSettingInput
                  name="update-channel"
                  title={t`Types of releases to check for`}
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
          </>
        )}
        {checkForUpdates && (
          <div
            className={cx(CS.pt3, CS.px2, {
              [CS.borderTop]: !isHosted,
            })}
          >
            <VersionUpdateNotice />
          </div>
        )}
      </Box>
      <div>
        <UpsellHostingUpdates source="settings-updates-migrate_to_cloud" />
      </div>
    </Flex>
  );
}
