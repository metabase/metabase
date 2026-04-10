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

    // Wait for the editor to be mounted via a stable selector instead of a
    // German UI string. The data picker is the first thing to render in the
    // notebook editor when starting from `questionId="new"`.
    getSdkRoot().findByTestId("data-step-cell").should("be.visible");
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

    // Click into the (empty) filter step to open its popover. We target the
    // step container by its stable test id rather than relying on the German
    // "Add filters to narrow your answer" placeholder text.
    getSdkRoot()
      .findByTestId("step-filter-0-0")
      .findByTestId("notebook-cell-item")
      .click();

    popover().within(() => {
      cy.findByText("Gesamtsumme").should("exist");
      cy.findByText("Steuer").should("exist");
      cy.findByText("Menge").should("exist");
    });
  });
});
