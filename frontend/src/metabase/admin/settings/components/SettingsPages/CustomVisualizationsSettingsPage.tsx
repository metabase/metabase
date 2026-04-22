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

const CUSTOM_VIZ_ENABLED_SETTING = "custom-viz-enabled";

export function CustomVizEnableSwitch() {
  const { value: isCustomVizEnabled } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );
  const hasCustomVizFeature = useHasTokenFeature("custom-viz");
  const previousIsCustomVizEnabled = usePrevious(isCustomVizEnabled);
  const showCustomVizSettings = isCustomVizEnabled && hasCustomVizFeature;

  const description = showCustomVizSettings
    ? t`Should custom visualizations be enabled for this instance? Disabling this will reload the page.`
    : t`Should custom visualizations be enabled for this instance? Enabling this will reload the page.`;

  useEffect(() => {
    if (
      previousIsCustomVizEnabled === undefined ||
      isCustomVizEnabled === undefined
    ) {
      return;
    }

    if (isCustomVizEnabled !== previousIsCustomVizEnabled) {
      window.location.reload();
    }
  }, [isCustomVizEnabled, previousIsCustomVizEnabled]);

  return (
    <AdminSettingInput
      name={CUSTOM_VIZ_ENABLED_SETTING}
      title={t`Enable Custom Visualizations`}
      inputType="boolean"
      description={description}
    />
  );
}

export function CustomVisualizationsManagePage() {
  const customVizIsAvailable = useHasTokenFeature("custom-viz-available");
  const customVizFeatureLoaded = useHasTokenFeature("custom-viz");
  const { value: customVizEnabled } = useAdminSetting(
    CUSTOM_VIZ_ENABLED_SETTING,
  );
  const previousCustomVizEnabled = usePrevious(customVizEnabled);

  useEffect(() => {
    if (
      previousCustomVizEnabled === undefined ||
      customVizEnabled === undefined
    ) {
      return;
    }
    if (previousCustomVizEnabled !== customVizEnabled) {
      window.location.reload();
    }
  }, [customVizEnabled, previousCustomVizEnabled]);

  if (!customVizIsAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  if (!customVizFeatureLoaded) {
    return (
      <SettingsPageWrapper
        title={t`Custom visualizations`}
        description={t`Add custom visualizations to your instance here by adding links to git repositories containing custom visualization bundles.`}
      >
        <SettingsSection>
          <CustomVizEnableSwitch />
        </SettingsSection>
      </SettingsPageWrapper>
    );
  }

  return <PLUGIN_CUSTOM_VIZ.ManageCustomVizPage />;
}

export function CustomVisualizationsFormPage({
  params,
}: {
  params?: { id?: string };
}) {
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");

  if (!hasCustomVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }

  return <PLUGIN_CUSTOM_VIZ.CustomVizPage params={params} />;
}

export function CustomVisualizationsDevelopmentPage() {
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");

  if (!hasCustomVizAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
      </SettingsPageWrapper>
    );
  }
  return <PLUGIN_CUSTOM_VIZ.CustomVizDevPage />;
}
