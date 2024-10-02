import type { AdminSettingSection } from "metabase/admin/settings/selectors";
import { NotFound } from "metabase/components/ErrorPages";

import { SettingsSection } from "../../SettingsSection";
import { SettingElement } from "metabase/admin/settings/types";
import { Settings } from "metabase-types/api";
import { useDispatch } from "metabase/lib/redux";
import { useOnChangeSetting, useUpdateSetting } from "../../use-update-setting";
import { reloadSettings } from "metabase/admin/settings/settings";

export const SettingsPane = ({
  activeSection,
  settings,
  settingValues,
  derivedSettingValues,
  saveStatusRef,
  handleChangeSetting,
}: {
  activeSection: AdminSettingSection;
  settings: SettingElement[];
  settingValues: Settings;
  derivedSettingValues: Settings;
}) => {
  const dispatch = useDispatch();

  const onUpdate = useUpdateSetting();
  const onChange = useOnChangeSetting();

  const onReloadSettings = () => dispatch(reloadSettings());

  const isLoading = settings.length === 0;

  if (isLoading) {
    return null;
  }

  if (!activeSection) {
    return <NotFound />;
  }

  if (activeSection.component) {
    return (
      <activeSection.component
        saveStatusRef={saveStatusRef}
        elements={activeSection.settings}
        settingValues={settingValues}
        derivedSettingValues={derivedSettingValues}
        updateSetting={onUpdate}
        onChangeSetting={onChange}
        reloadSettings={onReloadSettings}
      />
    );
  }
  return (
    <SettingsSection
      tabs={activeSection.tabs}
      settingElements={activeSection.settings}
      settingValues={settingValues}
      derivedSettingValues={derivedSettingValues}
      updateSetting={onUpdate}
      onChangeSetting={onChange}
      reloadSettings={onReloadSettings}
    />
  );
};
