import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import Database from "metabase-lib/v1/metadata/Database";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TagEditorHelp } from "../TagEditorHelp";

export interface SetupOpts {
  showMetabaseLinks?: boolean;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  specificPlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
}

export const setup = ({
  showMetabaseLinks = true,
  hasEnterprisePlugins,
  tokenFeatures = {},
  specificPlugins = [],
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (hasEnterprisePlugins) {
    if (specificPlugins.length > 0) {
      specificPlugins.forEach((plugin) => {
        setupEnterpriseOnlyPlugin(plugin);
      });
    } else {
      setupEnterprisePlugins();
    }
  }

  renderWithProviders(
    <TagEditorHelp
      database={new Database({ ...createMockDatabase(), tables: [] })}
      sampleDatabaseId={99}
      setDatasetQuery={jest.fn()}
      switchToSettings={jest.fn()}
    />,
    {
      storeInitialState: state,
    },
  );
};
