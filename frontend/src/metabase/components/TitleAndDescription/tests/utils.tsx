import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupContentTranslationEndpoints } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import {
  renderWithProviders,
  screen,
  waitFor,
  type waitForOptions,
} from "__support__/ui";
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
import { WaitForOptions } from "@testing-library/react-hooks";

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

export const assertStringsArePresent = async (key: "msgid" | "msgstr") => {
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

const assertNeverPasses = (
  fn: () => void | Promise<void>,
  options?: waitForOptions,
) => {
  let errored = false;
  try {
    waitFor(fn, options);
  } catch (_e) {
    errored = true;
  } finally {
    expect(errored).toBe(true);
  }
};

export const assertStringsDoNotBecomePresent = async (
  key: "msgid" | "msgstr",
) => {
  assertNeverPasses(() => {
    expect(
      screen.getByRole("heading", {
        name: sampleDictionary[0][key],
      }),
    ).toBeInTheDocument();
  });

  assertNeverPasses(async () => {
    await userEvent.hover(screen.getByLabelText("info icon"));
    expect(
      await screen.findByRole("tooltip", {
        name: sampleDictionary[1][key],
      }),
    ).toBeInTheDocument();
  });
};
