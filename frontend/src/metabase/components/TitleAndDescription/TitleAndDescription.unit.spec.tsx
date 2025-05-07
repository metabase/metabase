import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import type { RetrievedDictionaryArrayRow } from "metabase-types/api/content-translation";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TitleAndDescription from "../TitleAndDescription";

interface SetupOpts {
  localeCode: string;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  dictionary?: RetrievedDictionaryArrayRow[];
}

const dictionary: RetrievedDictionaryArrayRow[] = [
  { id: 0, locale: "de", msgid: "Sample text", msgstr: "Beispieltext" },
  {
    id: 1,
    locale: "de",
    msgid: "Sample description",
    msgstr: "Beispielbeschreibung",
  },
];

const baseSetup = ({
  localeCode,
  hasEnterprisePlugins,
  tokenFeatures = {},
  dictionary = [],
}: SetupOpts) => {
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
      title={dictionary[0].msgid}
      description={dictionary[1].msgid}
    />,
    { storeInitialState },
  );
};

const assertStringsArePresent = async ({
  shouldBeTranslated,
}: {
  shouldBeTranslated: boolean;
}) => {
  const key = shouldBeTranslated ? "msgstr" : "msgid";
  expect(
    await screen.findByRole("heading", {
      name: dictionary[0][key],
    }),
  ).toBeInTheDocument();

  await userEvent.hover(screen.getByLabelText("info icon"));
  expect(
    await screen.findByRole("tooltip", {
      name: dictionary[1][key],
    }),
  ).toBeInTheDocument();
};

describe("TitleAndDescription component", () => {
  describe("OSS", () => {
    const setup = (opts: SetupOpts) =>
      baseSetup({ hasEnterprisePlugins: false, ...opts });

    describe("when a German content translation dictionary is provided", () => {
      it("displays untranslated question title and description when locale is English", async () => {
        setup({ localeCode: "en", dictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });

      it("displays untranslated question title and description when locale is German", async () => {
        setup({ localeCode: "de", dictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });
    });
  });

  describe("EE without token feature", () => {
    const setup = (opts: SetupOpts) =>
      baseSetup({
        hasEnterprisePlugins: true,
        tokenFeatures: { content_translation: false },
        ...opts,
      });

    describe("when a German content translation dictionary is provided", () => {
      it("displays untranslated question title and description when locale is English", async () => {
        setup({ localeCode: "en", dictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });

      it("displays untranslated question title and description when locale is German", async () => {
        setup({ localeCode: "de", dictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });
    });
  });

  describe("EE with token", () => {
    const setup = (opts: SetupOpts) =>
      baseSetup({
        hasEnterprisePlugins: true,
        tokenFeatures: { content_translation: true },
        ...opts,
      });

    describe("when a German content translation dictionary is provided", () => {
      it("displays untranslated question title and description when locale is English", async () => {
        setup({ localeCode: "en", dictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });

      it("displays translated question title and description when locale is German", async () => {
        setup({ localeCode: "de", dictionary });
        assertStringsArePresent({ shouldBeTranslated: true });
      });
    });
  });
});
