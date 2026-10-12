import type { ComponentType } from "react";

import {
  contentDiagnosticsSectionLayout,
  contentDiagnosticsUpsellPage,
} from "metabase/monitor/routes";
import {
  notFoundRoute,
  outletRoute,
  redirectRoute,
} from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";
import { Route } from "metabase/router";
import { featureGatedRoute } from "metabase-enterprise/settings/feature-gated-route";

import {
  CrowdedContentPage,
  DuplicatedContentPage,
  EmptyContentPage,
  SlowContentPage,
  SparseContentPage,
  StaleContentPage,
} from "./pages";

const page =
  (Component: ComponentType): PluginRoute =>
  async () => ({ Component });

const gated = (enabled: PluginRoute) =>
  featureGatedRoute(
    "content_diagnostics",
    enabled,
    contentDiagnosticsUpsellPage,
  );

export function getContentDiagnosticsRoutes() {
  return (
    <Route
      lazy={featureGatedRoute(
        "content_diagnostics",
        contentDiagnosticsSectionLayout,
        outletRoute,
      )}
    >
      <Route index lazy={gated(redirectRoute("stale"))} />
      <Route path="stale" lazy={gated(page(StaleContentPage))} />
      <Route path="duplicated" lazy={gated(page(DuplicatedContentPage))} />
      <Route path="slow" lazy={gated(page(SlowContentPage))} />
      <Route path="empty" lazy={gated(page(EmptyContentPage))} />
      <Route path="sparse" lazy={gated(page(SparseContentPage))} />
      <Route path="crowded" lazy={gated(page(CrowdedContentPage))} />
      <Route path="*" lazy={gated(notFoundRoute)} />
    </Route>
  );
}
