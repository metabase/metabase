import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import type { TokenFeatures } from "metabase-types/api";

import { ImpossibleToCreateModelModal } from "../ImpossibleToCreateModelModal";

export interface SetupOpts {
  showMetabaseLinks: boolean;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setup = ({
  showMetabaseLinks = true,
  enterprisePlugins,
  tokenFeatures = {},
}: SetupOpts) => {
  const { render } = createScenario()
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<ImpossibleToCreateModelModal onClose={jest.fn()} />);
};
