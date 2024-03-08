import { useEffect } from "react";
import { push } from "react-router-redux";

import type { SettingElement } from "metabase/admin/settings/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getIsEmailConfigured, getIsHosted } from "metabase/setup/selectors";
import type { Settings, SettingValue } from "metabase-types/api";

import { SettingsSection } from "../../app/components/SettingsEditor/SettingsSection";

import { SMTPConnectionCard } from "./SMTPConnectionCard";

interface SettingsEmailFormProps {
  elements: SettingElement[];
  settingValues: Settings;
  derivedSettingValues: Settings;
  updateSetting: (
    settingElement: SettingElement,
    newValue: SettingValue,
  ) => void;
  reloadSettings: VoidFunction;
}

export function SettingsEmailForm({
  elements,
  derivedSettingValues,
  reloadSettings,
  settingValues,
  updateSetting,
}: SettingsEmailFormProps) {
  const isHosted = useSelector(getIsHosted);
  const isEmailConfigured = useSelector(getIsEmailConfigured);

  const dispatch = useDispatch();

  useEffect(() => {
    if (!isHosted && !isEmailConfigured) {
      dispatch(push("/admin/settings/email/smtp"));
    }
  }, [dispatch, isHosted, isEmailConfigured]);

  const settingElements = elements.filter(
    setting => !setting.getHidden?.(settingValues, derivedSettingValues),
  );

  return (
    <>
      {!isHosted && <SMTPConnectionCard />}
      <SettingsSection
        settingElements={settingElements}
        settingValues={settingValues}
        derivedSettingValues={derivedSettingValues}
        updateSetting={updateSetting}
        reloadSettings={reloadSettings}
      />
    </>
  );
}
