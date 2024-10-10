import cx from "classnames";
import { c } from "ttag";

import { UpsellHostingUpdates } from "metabase/admin/upsells";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Flex } from "metabase/ui";
import type { SettingDefinition, UpdateChannel } from "metabase-types/api";

import { SettingsSetting } from "../SettingsSetting";

import { VersionUpdateNotice } from "./VersionUpdateNotice/VersionUpdateNotice";

const updateChannelSetting = {
  key: "update-channel",
  display_name: "Types of releases to check for",
  type: "select",
  description:
    "We'll notify you here when there's a new version of this type of release.",
  defaultValue: "latest",
  options: [
    {
      name: c("describes a set of software version releases")
        .t`Stable releases`,
      value: "latest",
    },
    {
      name: c("describes a set of software version releases").t`Beta releases`,
      value: "beta",
    },
    {
      name: c("describes a set of software version releases").t`Nightly builds`,
      value: "nightly",
    },
  ],
} as const;

export function SettingsUpdatesForm({
  elements,
  updateSetting,
}: {
  elements: SettingDefinition[];
  // typing this properly is a fool's errand without a major settings refactor
  updateSetting: (
    setting: Partial<SettingDefinition> & Record<string, any>,
    newValue: unknown,
  ) => void;
}) {
  const [setting] = elements;
  const isHosted = useSetting("is-hosted?");
  const checkForUpdates = useSetting("check-for-updates");
  const updateChannelValue = useSetting("update-channel");

  return (
    <Flex justify="space-between" data-testid="settings-updates">
      <div style={{ width: "585px" }}>
        {!isHosted && (
          <ul>
            <SettingsSetting
              key={setting.key}
              setting={setting}
              onChange={(value: boolean) => updateSetting(setting, value)}
            />
            {checkForUpdates && (
              <li>
                <SettingsSetting
                  key="update-channel"
                  setting={{
                    ...updateChannelSetting,
                    value: updateChannelValue,
                  }}
                  onChange={(newValue: UpdateChannel) =>
                    updateSetting(updateChannelSetting, newValue)
                  }
                />
              </li>
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
