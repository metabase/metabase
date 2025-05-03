import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import type { DictionaryResponse } from "metabase-types/api/content-translation";
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

const sampleDictionary = [
  { id: 0, locale: "de", msgid: "Sample text", msgstr: "Beispieltext" },
  {
    id: 1,
    locale: "de",
    msgid: "Sample description",
    msgstr: "Beispielbeschreibung",
  },
];

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
    currentUser: createMockUser({ id: 1, locale: localeCode }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  fetchMock.get("path:/api/ee/content-translation/dictionary", (url) => {
    const localeCode = new URL(url).searchParams.get("locale");
    const response: DictionaryResponse = {
      data: sampleDictionary.filter((row) => row.locale === localeCode),
    };
    return response;
  });

  return renderWithProviders(
    <TitleAndDescription
      title="Sample text"
      description="Sample description"
    />,
    { storeInitialState: state },
  );
}
