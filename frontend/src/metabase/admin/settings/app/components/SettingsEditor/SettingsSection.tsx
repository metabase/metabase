import { Tabs } from "metabase/ui";
import type { SettingKey, SettingValue, Settings } from "metabase-types/api";
import type { SettingElement } from "metabase/admin/settings/types";
import SettingsSetting from "metabase/admin/settings/components/SettingsSetting";

interface Tab {
  name: string;
  key: string;
}

interface SettingsSectionProps {
  tabs: Tab[];
  settingElements: SettingElement[];
  settingValues: Settings;
  derivedSettingValues: Settings;
  updateSetting: (
    settingElement: SettingElement,
    newValue: SettingValue,
  ) => void;
  onChangeSetting?: (key: SettingKey, value: SettingValue) => void;
  reloadSettings: VoidFunction;
}

export function SettingsSection({
  tabs,
  settingElements,
  settingValues,
  derivedSettingValues,
  updateSetting,
  onChangeSetting,
  reloadSettings,
}: SettingsSectionProps) {
  if (tabs) {
    const firstTabKey = tabs[0].key;
    return (
      <Tabs defaultValue={firstTabKey}>
        <Tabs.List mx="1rem" mb="1rem">
          {tabs.map(tab => (
            <Tabs.Tab key={tab.key} value={tab.key}>
              {tab.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        {tabs.map((tab, index) => {
          const isFirstTab = index === 0;
          const tabSettingElements = settingElements.filter(settingElement =>
            settingElement.tab ? settingElement.tab === tab.key : isFirstTab,
          );

          return (
            <Tabs.Panel key={tab.key} value={tab.key}>
              <SettingsList
                settingElements={tabSettingElements}
                settingValues={settingValues}
                derivedSettingValues={derivedSettingValues}
                updateSetting={updateSetting}
                onChangeSetting={onChangeSetting}
                reloadSettings={reloadSettings}
              />
            </Tabs.Panel>
          );
        })}
      </Tabs>
    );
  }

  return (
    <SettingsList
      settingElements={settingElements}
      settingValues={settingValues}
      derivedSettingValues={derivedSettingValues}
      updateSetting={updateSetting}
      onChangeSetting={onChangeSetting}
      reloadSettings={reloadSettings}
    />
  );
}

type SettingsListProps = Pick<
  SettingsSectionProps,
  | "settingElements"
  | "settingValues"
  | "derivedSettingValues"
  | "updateSetting"
  | "onChangeSetting"
  | "reloadSettings"
>;

function SettingsList({
  settingElements,
  settingValues,
  derivedSettingValues,
  updateSetting,
  onChangeSetting,
  reloadSettings,
}: SettingsListProps) {
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
