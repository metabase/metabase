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

import { LegendCaption } from "../LegendCaption";

export interface SetupOpts {
  title: string;
  description?: string;
  locale?: string;
  translations?: RetrievedDictionaryArrayRow[];
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
}

export const sampleSpanishDictionary: RetrievedDictionaryArrayRow[] = [
  {
    id: 1,
    locale: "es",
    msgid: "Hello World",
    msgstr: "Hola Mundo",
  },
  {
    id: 2,
    locale: "es",
    msgid: "Chart Description",
    msgstr: "Descripción del Gráfico",
  },
];

export function setup({
  title,
  description,
  locale,
  translations,
  tokenFeatures,
  hasEnterprisePlugins = false,
}: SetupOpts) {
  const storeInitialState = createMockState({
    settings: tokenFeatures
      ? mockSettings({
          "token-features": createMockTokenFeatures(tokenFeatures),
        })
      : undefined,
    currentUser: locale ? createMockUser({ locale }) : undefined,
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  if (translations) {
    setupContentTranslationEndpoints({ dictionary: translations });
  }

  return renderWithProviders(
    <LegendCaption title={title} description={description} />,
    {
      storeInitialState,
    },
  );
}
