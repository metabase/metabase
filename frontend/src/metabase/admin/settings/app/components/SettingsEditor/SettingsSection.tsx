import { push } from "react-router-redux";

import { SettingsSetting } from "metabase/admin/settings/components/SettingsSetting";
import type { SettingElement } from "metabase/admin/settings/types";
import { useDispatch } from "metabase/lib/redux";
import { Tabs } from "metabase/ui";
import type { SettingKey, SettingValue, Settings } from "metabase-types/api";

interface Tab {
  name: string;
  key: string;
  to: string;
  isActive: boolean;
}

interface SettingsSectionProps {
  tabs?: Tab[];
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
  const dispatch = useDispatch();

  if (tabs) {
    const activeTab = tabs.find(tab => tab.isActive);
    return (
      <Tabs value={activeTab?.key}>
        <Tabs.List mx="1rem" mb="1rem">
          {tabs.map(tab => {
            return (
              <Tabs.Tab
                key={tab.key}
                value={tab.key}
                onClick={() => dispatch(push(tab.to))}
              >
                {tab.name}
              </Tabs.Tab>
            );
          })}
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
