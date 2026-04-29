import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import type { TokenFeatures } from "metabase-types/api";

import { HomeHelpCard } from "../HomeHelpCard";

export interface SetupOpts {
  applicationName?: string;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export const setup = ({
  applicationName = "Metabase",
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts = {}) => {
  const { render } = createScenario()
    .withSettings({
      "application-name": applicationName,
      "show-metabase-links": showMetabaseLinks,
    })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<HomeHelpCard />);
};
