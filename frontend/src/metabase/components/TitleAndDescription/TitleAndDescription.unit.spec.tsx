import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";

import type { RetrievedDictionaryArrayRow } from "metabase-types/api/content-translation";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TitleAndDescription from "../TitleAndDescription";
import { sampleDictionary } from "../constants";

const assertStringsArePresent = async ({
  shouldBeTranslated,
}: {
  shouldBeTranslated: boolean;
}) => {
  const key = shouldBeTranslated ? "msgstr" : "msgid";
  expect(
    await screen.findByRole("heading", {
      name: sampleDictionary[0][key],
    }),
  ).toBeInTheDocument();

  await userEvent.hover(screen.getByLabelText("info icon"));
  expect(
    await screen.findByRole("tooltip", {
      name: sampleDictionary[1][key],
    }),
  ).toBeInTheDocument();
};

describe("TitleAndDescription component", () => {
  describe("OSS", () => {
    const setup = (opts: SetupOpts) =>
      baseSetup({ hasEnterprisePlugins: false, ...opts });

    describe("when a German content translation dictionary is provided", () => {
      it("displays untranslated question title and description when locale is English", async () => {
        setup({ localeCode: "en", dictionary: sampleDictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });

      it("displays untranslated question title and description when locale is German", async () => {
        setup({ localeCode: "de", dictionary: sampleDictionary });
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
        setup({ localeCode: "en", dictionary: sampleDictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });

      it("displays untranslated question title and description when locale is German", async () => {
        setup({ localeCode: "de", dictionary: sampleDictionary });
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
        setup({ localeCode: "en", dictionary: sampleDictionary });
        assertStringsArePresent({ shouldBeTranslated: false });
      });

      it("displays translated question title and description when locale is German", async () => {
        setup({ localeCode: "de", dictionary: sampleDictionary });
        assertStringsArePresent({ shouldBeTranslated: true });
      });
    });
  });
});
