import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockSetupState,
  createMockState,
} from "metabase-types/store/mocks";

import TitleAndDescription from "../TitleAndDescription";

export interface SetupOpts {
  localeCode: string;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export function setup({
  localeCode,
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts) {
  const state = createMockState({
    setup: createMockSetupState({
      locale: { code: localeCode, name: "locale-name" },
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ id: 1 }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  fetchMock.get(
    {
      url: "path:/api/ee/content-translation/dictionary",
    },
    {
      data: [{ locale: "de", msgid: "Sample text", msgstr: "Beispieltext" }],
    },
  );

  return renderWithProviders(
    <TitleAndDescription
      title="Sample text"
      description="Sample description"
    />,
    { storeInitialState: state },
  );
}
