import cx from "classnames";
import { t } from "ttag";

import { UpsellHostingBanner } from "metabase/admin/upsells";
import { NotFound } from "metabase/common/components/ErrorPages";
import CS from "metabase/css/core/index.css";
import { useSetting } from "metabase/settings";
import { AdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/settings-components/SettingsSection";

import { VersionUpdateNotice } from "../widgets/VersionUpdateNotice";
import { NewVersionInfo } from "../widgets/VersionUpdateNotice/VersionUpdateNotice";

export function UpdatesSettingsPage() {
  const isHosted = useSetting("is-hosted?");
  const checkForUpdates = useSetting("check-for-updates");

  if (isHosted) {
    return <NotFound />;
  }

  return (
    <SettingsPageWrapper data-testid="settings-updates" title={t`Updates`}>
      <SettingsSection>
        <AdminSettingInput
          name="check-for-updates"
          title={t`Check for updates`}
          inputType="boolean"
        />
        {checkForUpdates && (
          <div
            className={cx(CS.pt3, {
              [CS.borderTop]: !isHosted,
            })}
          >
            <VersionUpdateNotice />
          </div>
        )}
        <NewVersionInfo />
      </SettingsSection>
      <UpsellHostingBanner location="settings-updates-migrate_to_cloud" />
    </SettingsPageWrapper>
  );
}
