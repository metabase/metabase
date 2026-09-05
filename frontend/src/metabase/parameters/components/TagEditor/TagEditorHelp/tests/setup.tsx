import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, TokenFeatures } from "metabase-types/api";
import {
  createMockDatabase,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { TagEditorHelp } from "../TagEditorHelp";

export interface SetupOpts {
  showMetabaseLinks?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  sampleDatabaseId: DatabaseId | null;
}

export const setup = ({
  showMetabaseLinks = true,
  tokenFeatures = {},
  enterprisePlugins = [],
  sampleDatabaseId,
}: SetupOpts) => {
  const state = createMockState({
    settings: mockSettings({
      "show-metabase-links": showMetabaseLinks,
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  enterprisePlugins.forEach((plugin) => {
    setupEnterpriseOnlyPlugin(plugin);
  });

  renderWithProviders(
    <TagEditorHelp
      database={new Database({ ...createMockDatabase(), tables: [] })}
      sampleDatabaseId={sampleDatabaseId ?? undefined}
      setDatasetQuery={jest.fn()}
      switchToSettings={jest.fn()}
    />,
    {
      storeInitialState: state,
    },
  );
};
