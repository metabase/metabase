import cx from "classnames";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { UpsellHostingBanner } from "metabase/admin/upsells";
import { NotFound } from "metabase/common/components/ErrorPages";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";

import { AdminSettingInput } from "../widgets/AdminSettingInput";
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
            className={cx(CS.pt3, CS.px2, {
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
