import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { renderHookWithProviders } from "__support__/ui";
import { useListContentTranslationsQuery } from "metabase-enterprise/api";
import type { TokenFeatures } from "metabase-types/api";
import { renderHookWithProviders } from "__support__/ui";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import type { RetrievedDictionaryArrayRow } from "metabase-types/api/content-translation";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useTranslateContent } from "./use-translate-content";

interface SetupOpts {
  locale: string | undefined;
  /** An untranslated string */
  msgid: string | null | undefined;
  translations: RetrievedDictionaryArrayRow[] | undefined;
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
}

const sampleSpanishDictionary: RetrievedDictionaryArrayRow[] = [
  {
    id: 1,
    locale: "es",
    msgid: "Hello World",
    msgstr: "Hola Mundo",
  },
];

const TestComponent = ({ msgid }: { msgid?: string | null }) => {
  const tc = useTranslateContent();
  const msgstr = tc(msgid);
  return <>{msgstr}</>;
};

function setup({ locale, msgid, translations }: SetupOpts) {
  setupEnterprisePlugins();
  setupContentTranslationEndpoints({ dictionary: translations });

  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ content_translation: true }),
    }),
    currentUser: createMockUser({ locale }),
  });

  return renderWithProviders(<TestComponent msgid={msgid} />, {
    storeInitialState,
  });
}

describe("useTranslateContent", () => {
  it("should return the original string when dictionary is undefined", async () => {
    const { result } = setup({
      msgid: "Hello World",
      locale: "es",
      translations: undefined,
    });
    expect(await screen.findByText("Hello World")).toBeInTheDocument();
  });

  it("should return the original string when locale is undefined", async () => {
    setup({
      msgid: "Hello World",
      locale: undefined,
      translations: sampleSpanishDictionary,
    });
    expect(await screen.findByText("Hello World")).toBeInTheDocument();
  });

  it("should return the msgid when it is not a string", async () => {
    setup({
      msgid: null,
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(screen.queryByText("Hello World")).not.toBeInTheDocument();
  });

  it("should return the original string when translation is an empty string", async () => {
    const { result } = setup({
      msgid: "Hello World!!!",
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(result.current).toBe("Hello World!!!");
  });

  it("should return the original string when translation is an empty string", () => {
    const { result } = setup({
      msgid: "",
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(result.current).toBe("");
  });

  it("should return the original string when no translation is found", async () => {
    setup({
      msgid: "Hello? World?",
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(await screen.findByText("Hello? World?")).toBeInTheDocument();
  });

  it("should return the translated string when a translation is found", async () => {
    setup({
      msgid: "Hello World",
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(await screen.findByText("Hola Mundo")).toBeInTheDocument();
  });
});
