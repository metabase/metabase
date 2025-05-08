import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { assertNeverPasses } from "__support__/utils";
import type {
  RetrievedDictionaryArrayRow,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import TitleAndDescription from "../TitleAndDescription";

import { sampleDictionary } from "./constants";

export interface SetupOpts {
  localeCode: string;
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  dictionary?: RetrievedDictionaryArrayRow[];
}

export const setup = ({
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

export const assertStringsArePresent = async (
  stringType: "msgid" | "msgstr",
) => {
  expect(
    await screen.findByRole("heading", {
      name: sampleDictionary[0][stringType],
    }),
  ).toBeInTheDocument();

  await userEvent.hover(screen.getByLabelText("info icon"));
  expect(
    await screen.findByRole("tooltip", {
      name: sampleDictionary[1][stringType],
    }),
  ).toBeInTheDocument();
};

export const assertStringsDoNotBecomePresent = async (
  /** A 'msgid' is a raw, untranslated string. A translation of a msgid is
   * called a 'msgstr'. */
  stringType: "msgid" | "msgstr",
) => {
  await assertNeverPasses(async () => {
    expect(
      await screen.findByRole("heading", {
        name: sampleDictionary[0][stringType],
      }),
    ).toBeInTheDocument();
  });

  await assertNeverPasses(async () => {
    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: sampleDictionary[1][stringType],
      }),
    ).toBeInTheDocument();
  });
};
