import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { UpsellCustomViz } from "metabase/admin/upsells";
import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";

export function CustomVisualizationsManagePage() {
  const customVizLoaded = useHasTokenFeature("custom-viz");
  const customVizAvailable = useHasTokenFeature("custom-viz-available");

  useCustomVizEnabledSetting();

  if (!customVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  if (!customVizLoaded) {
    return <CustomVizNotLoaded />;
  }

  return <PLUGIN_CUSTOM_VIZ.ManageCustomVizPage />;
}

export function CustomVisualizationsFormPage({
  params,
}: {
  params?: { id?: string };
}) {
  const customVizFeatureLoaded = useHasTokenFeature("custom-viz");
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");
  useCustomVizEnabledSetting();

  if (!hasCustomVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  if (!customVizFeatureLoaded) {
    return <CustomVizNotLoaded />;
  }

  return <PLUGIN_CUSTOM_VIZ.CustomVizPage params={params} />;
}

export function CustomVisualizationsDevelopmentPage() {
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");
  const customVizFeatureLoaded = useHasTokenFeature("custom-viz");
  useCustomVizEnabledSetting();

  if (!hasCustomVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  if (!customVizFeatureLoaded) {
    return <CustomVizNotLoaded />;
  }

  return <PLUGIN_CUSTOM_VIZ.CustomVizDevPage />;
}

const CUSTOM_VIZ_ENABLED_SETTING = "custom-viz-enabled";

function CustomVizNotLoaded() {
  return (
    <SettingsPageWrapper title={t`Custom visualizations`}>
      <SettingsSection>
        <CustomVizEnableSwitch />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

export function CustomVizEnableSwitch() {
  const { value: customVizEnabledSetting } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );

  const description = customVizEnabledSetting
    ? t`Should custom visualizations be enabled for this instance? Disabling this will reload the page.`
    : t`Should custom visualizations be enabled for this instance? Enabling this will reload the page.`;

  return (
    <AdminSettingInput
      name={CUSTOM_VIZ_ENABLED_SETTING}
      title={t`Enable Custom Visualizations`}
      inputType="boolean"
      description={description}
    />
  );
}

function useCustomVizEnabledSetting() {
  const { value: customVizEnabledSetting } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );
  const customVizEnabledSettingPrev = usePrevious(customVizEnabledSetting);

  useEffect(() => {
    if (
      customVizEnabledSettingPrev === undefined ||
      customVizEnabledSetting === undefined
    ) {
      return;
    }

    if (customVizEnabledSetting !== customVizEnabledSettingPrev) {
      setTimeout(() => {
        window.location.reload();
        // timeout helps to render the UI consistently when toggling feature
      }, 1000);
    }
  }, [customVizEnabledSetting, customVizEnabledSettingPrev]);
}
