import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import type { TokenFeatures } from "metabase-types/api";

import { MetricEditorSidebar } from "../MetricEditorSidebar";

export type SetupOpts = {
  tokenFeatures?: Partial<TokenFeatures>;
  showMetabaseLinks?: boolean;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
};

export function setup({
  tokenFeatures,
  showMetabaseLinks,
  enterprisePlugins = [],
}: SetupOpts = {}) {
  const { render } = createScenario()
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<MetricEditorSidebar />);
}
