import cx from "classnames";
import { c, t } from "ttag";

import { UpsellHostingBanner } from "metabase/admin/upsells";
import { useSetting } from "metabase/common/hooks";
import { NotFound } from "metabase/components/ErrorPages";
import CS from "metabase/css/core/index.css";
import { Stack, Title } from "metabase/ui";

import { SettingsSection } from "../SettingsSection";
import { AdminSettingInput } from "../widgets/AdminSettingInput";
import { VersionUpdateNotice } from "../widgets/VersionUpdateNotice";

export function UpdatesSettingsPage() {
  const isHosted = useSetting("is-hosted?");
  const checkForUpdates = useSetting("check-for-updates");

  if (isHosted) {
    return <NotFound />;
  }

  return (
    <Stack data-testid="settings-updates" gap="xl">
      <Title order={1}>{t`Updates`}</Title>
      <SettingsSection>
        <AdminSettingInput
          name="check-for-updates"
          title={t`Check for updates`}
          inputType="boolean"
        />
        {checkForUpdates && (
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
      </SettingsSection>
      <UpsellHostingBanner source="settings-updates-migrate_to_cloud" />
    </Stack>
  );
}
