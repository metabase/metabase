import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellCustomViz } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";

export function CustomVisualizationsManagePage() {
  const customVizIsAvailable = useHasTokenFeature("custom-viz-available");

  if (!customVizIsAvailable) {
    return (
      <SettingsPageWrapper title={t`Custom visualizations`}>
        <UpsellCustomViz location="settings-custom-viz" />
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
