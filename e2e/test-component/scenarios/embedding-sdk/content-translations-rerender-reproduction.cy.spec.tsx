import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { popover } from "e2e/support/helpers";
import { uploadTranslationDictionaryViaAPI } from "e2e/support/helpers/e2e-content-translation-helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import { mountSdkContent } from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";

describe("scenarios > embedding-sdk > content-translations-rerender-reproduction", () => {
  const setupEditor = () => {
    signInAsAdminAndEnableEmbeddingSdk();

    uploadTranslationDictionaryViaAPI([
      // Table translations
      { locale: "de", msgid: "Orders", msgstr: "Bestellungen" },
      { locale: "de", msgid: "Products", msgstr: "Produkte" },
      // Column translations
      { locale: "de", msgid: "Total", msgstr: "Gesamtsumme" },
      { locale: "de", msgid: "Tax", msgstr: "Steuer" },
      { locale: "de", msgid: "Quantity", msgstr: "Menge" },
    ]);

    cy.signOut();
  };

  const mountEditor = () => {
    // The German dictionary is only fetched once the SDK has authenticated,
    // loaded its settings and initialized the content-translation plugin. The
    // app renders untranslated until then, so the assertions below have to wait
    // for this request rather than for the static German label alone.
    cy.intercept({
      method: "GET",
      pathname: "/api/ee/content-translation/dictionary",
      query: { locale: "de" },
    }).as("germanDictionary");

    mockAuthProviderAndJwtSignIn();

    mountSdkContent(
      <div style={{ display: "flex", padding: "20px" }}>
        <InteractiveQuestion questionId="new" />
      </div>,
      {
        sdkProviderProps: {
          locale: "de",
        },
      },
    );

    cy.wait("@germanDictionary", { timeout: 30000 });

    getSdkRoot().contains("Wähle deine Start-Daten");
  };

  it("should rerender content after a content-translation plugin is loaded", () => {
    setupEditor();
    mountEditor();

    popover().within(() => {
      // Use .should("exist") instead of .should("be.visible") because
      // elements in scrollable popovers might be below the fold
      cy.findByText("Produkte").should("exist");

      cy.findByText("Bestellungen").click();
    });

    getSdkRoot().within(() => {
      cy.findByText("Füge Filter hinzu, um deine Antwort einzugrenzen").click();
    });

    popover().within(() => {
      cy.findByText("Gesamtsumme").should("exist");
      cy.findByText("Steuer").should("exist");
      cy.findByText("Menge").should("exist");
    });
  });
});
