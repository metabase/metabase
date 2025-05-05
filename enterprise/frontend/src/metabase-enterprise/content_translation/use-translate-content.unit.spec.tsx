import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders } from "__support__/ui";
import { useListContentTranslationsQuery } from "metabase-enterprise/api";
import type { TokenFeatures } from "metabase-types/api";
import type { RetrievedDictionaryArrayRow } from "metabase-types/api/content-translation";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useTranslateContent } from "./use-translate-content";

jest.mock("metabase-enterprise/api", () => ({
  useListContentTranslationsQuery: jest.fn(),
}));

const mockUseListContentTranslationsQuery =
  useListContentTranslationsQuery as jest.Mock;

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

function setup({
  locale,
  msgid,
  translations,
  tokenFeatures = {},
  hasEnterprisePlugins = true,
}: SetupOpts) {
  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }
  mockUseListContentTranslationsQuery.mockReturnValue({
    data: translations ? { data: translations } : undefined,
  });

  const storeInitialState = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
    currentUser: createMockUser({ locale }),
  });

  const utils = renderHookWithProviders(
    () => {
      // NOTE: To use this hook, initialize a tc function and pass in a string
      const tc = useTranslateContent();
      const result = tc(msgid);
      return result;
    },
    {
      storeInitialState,
    },
  );

  return utils;
}

describe("useTranslateContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return the original string when dictionary is undefined", () => {
    const { result } = setup({
      msgid: "Hello World",
      locale: "es",
      translations: undefined,
    });
    expect(result.current).toBe("Hello World");
  });

  it("should return the original string when locale is undefined", () => {
    const { result } = setup({
      msgid: "Hello World",
      locale: undefined,
      translations: sampleSpanishDictionary,
    });
    expect(result.current).toBe("Hello World");
  });

  it("should return the msgid when it is not a string", () => {
    const { result } = setup({
      msgid: null,
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(result.current).toBe(null);
  });

  it("should return the original string when msgid is an empty string", () => {
    const { result } = setup({
      msgid: "",
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(result.current).toBe("");
  });

  it("should return the original string when no translation is found", () => {
    const { result } = setup({
      msgid: "Hello World!!!",
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(result.current).toBe("Hello World!!!");
  });

  it("should return the original string when translation is an empty string", () => {
    const { result } = setup({
      msgid: "Hello World",
      locale: "es",
      translations: [
        {
          ...sampleSpanishDictionary[0],
          msgstr: "",
        },
      ],
    });
    expect(result.current).toBe("Hello World");
  });

  it("should return the translated string when a translation is found", () => {
    const { result } = setup({
      msgid: "Hello World",
      locale: "es",
      translations: sampleSpanishDictionary,
    });
    expect(result.current).toBe("Hola Mundo");
  });
});
