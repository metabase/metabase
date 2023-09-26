import type { SettingKey, SettingValue, Settings } from "metabase-types/api";
import type { SettingElement } from "metabase/admin/settings/types";
import SettingsSetting from "metabase/admin/settings/components/SettingsSetting";

export function SettingsSection({
  settingElements,
  settingValues,
  derivedSettingValues,
  updateSetting,
  onChangeSetting,
  reloadSettings,
}: {
  settingElements: SettingElement[];
  settingValues: Settings;
  derivedSettingValues: Settings;
  updateSetting: (
    settingElement: SettingElement,
    newValue: SettingValue,
  ) => void;
  onChangeSetting: (key: SettingKey, value: SettingValue) => void;
  reloadSettings: VoidFunction;
}) {
  return (
    <ul>
      {settingElements
        .filter(({ getHidden }) =>
          getHidden ? !getHidden(settingValues, derivedSettingValues) : true,
        )
        .map((settingElement, index) => (
          <SettingsSetting
            key={settingElement.key}
            setting={settingElement}
            onChange={(newValue: SettingValue) =>
              updateSetting(settingElement, newValue)
            }
            onChangeSetting={onChangeSetting}
            reloadSettings={reloadSettings}
            autoFocus={index === 0}
            settingValues={settingValues}
          />
        ))}
    </ul>
  );
}
