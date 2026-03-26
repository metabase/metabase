import { UpsellCustomViz } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_CUSTOM_VIZ } from "metabase/plugins";

export function CustomVisualizationsManagePage() {
  const hasCustomViz = useHasTokenFeature("custom-viz");

  if (!hasCustomViz) {
    return <UpsellCustomViz source="settings-custom-viz" />;
  }

  return <PLUGIN_CUSTOM_VIZ.ManageCustomVisualizationsPage />;
}

export function CustomVisualizationsFormPage({
  params,
}: {
  params?: { id?: string };
}) {
  const hasCustomViz = useHasTokenFeature("custom-viz");

  if (!hasCustomViz) {
    return <UpsellCustomViz source="settings-custom-viz" />;
  }

  return <PLUGIN_CUSTOM_VIZ.CustomVizFormPage params={params} />;
}

export function CustomVisualizationsDevelopmentPage() {
  const hasCustomViz = useHasTokenFeature("custom-viz");

  if (!hasCustomViz) {
    return <UpsellCustomViz source="settings-custom-viz" />;
  }

  return <PLUGIN_CUSTOM_VIZ.CustomVizDevelopmentPage />;
}
