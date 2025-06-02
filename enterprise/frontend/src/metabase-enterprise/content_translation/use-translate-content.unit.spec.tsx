import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupTranslateContentStringSpy } from "__support__/server-mocks/content-translation";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
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
}

const TestComponent = ({ msgid }: { msgid?: string | null }) => {
  const tc = useTranslateContent();
  const msgstr = tc(msgid);
  return <>{msgstr}</>;
};

function setup({ locale, msgid }: SetupOpts) {
  setupEnterprisePlugins();

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
  const getContentTranslatorSpy = setupTranslateContentStringSpy();

  it("returns a function that translates the given string", async () => {
    setup({
      msgid: "Hello World",
      locale: "es",
    });
    expect(
      await screen.findByText("translated_Hello World"),
    ).toBeInTheDocument();
    expect(getContentTranslatorSpy()).toHaveBeenCalled();
  });
});
