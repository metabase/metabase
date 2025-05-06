import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import type { RetrievedDictionaryArrayRow } from "metabase-types/api/content-translation";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TitleAndDescription from "../TitleAndDescription";

import { dictionaryWithGermanPhrases } from "./constants";

export interface SetupOpts {
  localeCode: string;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  dictionary?: RetrievedDictionaryArrayRow[];
}

export function setup({
  localeCode,
  hasEnterprisePlugins,
  tokenFeatures = {},
  dictionary = [],
}: SetupOpts) {
  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ locale: localeCode }),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  setupContentTranslationEndpoints({ dictionary });

  return renderWithProviders(
    <TitleAndDescription
      title={dictionaryWithGermanPhrases[0].msgid}
      description={dictionaryWithGermanPhrases[1].msgid}
    />,
    { storeInitialState },
  );
}
