import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { createScenario } from "__support__/scenarios";
import Database from "metabase-lib/v1/metadata/Database";
import type { TokenFeatures } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { TagEditorHelp } from "../TagEditorHelp";

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

  render(
    <TagEditorHelp
      database={new Database({ ...createMockDatabase(), tables: [] })}
      sampleDatabaseId={99}
      setDatasetQuery={jest.fn()}
      switchToSettings={jest.fn()}
    />,
  );
};
