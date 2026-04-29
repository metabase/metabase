import { Route } from "react-router";

import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import type { TokenFeatures } from "metabase-types/api";
import { createMockUserPermissions } from "metabase-types/api/mocks";

import NewModelOptions from "../NewModelOptions";

export interface SetupOpts {
  canCreateQueries?: boolean;
  canCreateNativeQueries?: boolean;
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
}

export function setup({
  canCreateQueries = false,
  canCreateNativeQueries = false,
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
}: SetupOpts) {
  const { render } = createScenario()
    .withUser({
      permissions: createMockUserPermissions({
        can_create_queries: canCreateQueries,
        can_create_native_queries: canCreateNativeQueries,
      }),
    })
    .withSettings({ "show-metabase-links": showMetabaseLinks })
    .withEnterprise({ plugins: enterprisePlugins, tokenFeatures })
    .build();

  render(<Route path="*" component={NewModelOptions}></Route>, {
    withRouter: true,
  });
}
