import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import type { TokenFeatures } from "metabase-types/api";

import { CaveatMessage } from "../CaveatMessage";

export interface SetupOpts {
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export const setup = ({
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts = {}) => {
  const { render } = createScenario()
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<CaveatMessage />);
};
