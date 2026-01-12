import { InteractiveQuestion } from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, popover } from "e2e/support/helpers";
import { uploadTranslationDictionaryViaAPI } from "e2e/support/helpers/e2e-content-translation-helpers";
import { getSdkRoot } from "e2e/support/helpers/e2e-embedding-sdk-helpers";
import {
  mountInteractiveQuestion,
  mountSdkContent,
} from "e2e/support/helpers/embedding-sdk-component-testing";
import {
  mockAuthProviderAndJwtSignIn,
  signInAsAdminAndEnableEmbeddingSdk,
} from "e2e/support/helpers/embedding-sdk-testing";
import { useTranslateContent } from "metabase/i18n/hooks";
import { Flex } from "metabase/ui";
import type { Card } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > content-translations", () => {
  describe("question", () => {
    const setup = ({ display }: { display?: Card["display"] } = {}) => {
      signInAsAdminAndEnableEmbeddingSdk();

      createQuestion({
        name: "Question Embed SDK",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["max", ["field", ORDERS.QUANTITY, null]]],
          breakout: [["field", ORDERS.PRODUCT_ID, null]],
          limit: 2,
        },
        display,
      }).then(({ body: question }) => {
        cy.wrap(question.id).as("questionId");
      });

      cy.signOut();
    };

    describe("content translation", () => {
      it("should show question content with applied content translation", () => {
        setup();

        cy.signInAsAdmin();

        uploadTranslationDictionaryViaAPI([
          {
            locale: "de",
            msgid: "Question Embed SDK",
            msgstr: "Override title für Deutsch",
          },
          {
            locale: "de",
            msgid: "Product ID",
            msgstr: "Override Product ID für Deutsch",
          },
        ]);

        cy.signOut();

        mockAuthProviderAndJwtSignIn();

        cy.get("@questionId").then(async () => {
          mountInteractiveQuestion(
            { title: true },
            {
              sdkProviderProps: {
                locale: "de",
              },
            },
          );

          getSdkRoot().within(() => {
            cy.findByText("Override title für Deutsch").should("be.visible");
            cy.findByText("Override Product ID für Deutsch").should(
              "be.visible",
            );
          });
        });
      });
    });
  });

  describe("endpoint reactivity", () => {
    it("should fetch translations when endpoint is set after component mounts", () => {
      signInAsAdminAndEnableEmbeddingSdk();

      uploadTranslationDictionaryViaAPI([
        { locale: "de", msgid: "Test String", msgstr: "Test Zeichenkette" },
      ]);

      cy.signOut();

      mockAuthProviderAndJwtSignIn();

      cy.intercept("GET", "/api/ee/content-translation/dictionary*").as(
        "getTranslations",
      );

      const TestComponent = () => {
        const tc = useTranslateContent();
        return <div data-testid="translated">{tc("Test String")}</div>;
      };

      mountSdkContent(<TestComponent />, {
        sdkProviderProps: { locale: "de" },
        waitForUser: false,
      });

      cy.wait("@getTranslations", { timeout: 5000 });

      cy.findByTestId("translated").should("have.text", "Test Zeichenkette");
    });
  });

  describe("editor", () => {
    const setupEditor = () => {
      signInAsAdminAndEnableEmbeddingSdk();

      uploadTranslationDictionaryViaAPI([
        // Table translations
        { locale: "de", msgid: "Orders", msgstr: "Bestellungen" },
        { locale: "de", msgid: "Products", msgstr: "Produkte" },
        { locale: "de", msgid: "People", msgstr: "Personen" },
        { locale: "de", msgid: "Reviews", msgstr: "Bewertungen" },
        // Column translations
        { locale: "de", msgid: "ID", msgstr: "Kennung" },
        { locale: "de", msgid: "Total", msgstr: "Gesamtsumme" },
        { locale: "de", msgid: "Tax", msgstr: "Steuer" },
        { locale: "de", msgid: "Quantity", msgstr: "Menge" },
        { locale: "de", msgid: "Discount", msgstr: "Rabatt" },
        { locale: "de", msgid: "Created At", msgstr: "Erstellt am" },
        { locale: "de", msgid: "Product ID", msgstr: "Produkt ID" },
        { locale: "de", msgid: "User ID", msgstr: "Benutzer ID" },
        { locale: "de", msgid: "Subtotal", msgstr: "Zwischensumme" },
        { locale: "de", msgid: "Address", msgstr: "Adresse" },
      ]);

      cy.signOut();
    };

    const mountEditor = () => {
      mockAuthProviderAndJwtSignIn();

      mountSdkContent(
        <Flex p="xl">
          <InteractiveQuestion questionId="new" />
        </Flex>,
        {
          sdkProviderProps: {
            locale: "de",
          },
        },
      );

      getSdkRoot().contains("Wähle deine Start-Daten");
    };

    it("should translate content in pick data step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("Produkte").should("be.visible");

        cy.findByText("Bestellungen").click();
      });

      getSdkRoot().within(() => {
        cy.findByText(
          "Füge Filter hinzu, um deine Antwort einzugrenzen",
        ).click();
      });

      popover().within(() => {
        cy.findByText("Gesamtsumme").should("be.visible");
        cy.findByText("Steuer").should("be.visible");
        cy.findByText("Menge").should("be.visible");
      });
    });

    it("should translate content in filter step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("Bestellungen").click();
      });

      getSdkRoot().within(() => {
        cy.findByText(
          "Füge Filter hinzu, um deine Antwort einzugrenzen",
        ).click();
      });

      popover().within(() => {
        cy.findByText("Gesamtsumme").click();
      });

      popover().within(() => {
        cy.findByTestId("number-filter-picker").within(() => {
          cy.findByText("Gesamtsumme").should("be.visible");

          cy.findByPlaceholderText("Min").type("100");
          cy.findByPlaceholderText("Max").type("200");

          cy.button("Füge einen Filter hinzu").click();
        });
      });

      getSdkRoot().within(() => {
        cy.findByText("Gesamtsumme ist zwischen 100 und 200").should(
          "be.visible",
        );
      });
    });

    it("should translate content in aggregation and breakout step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("Bestellungen").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Wähle eine Funktion oder Metrik aus").click();
      });

      popover().within(() => {
        cy.findByText("Summe von...").click();

        cy.findByText("Bestellungen").should("be.visible");
        cy.findByText("Rabatt").should("be.visible");
      });

      popover().within(() => {
        cy.findByText("Gesamtsumme").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Wähle eine Spalte für die Gruppierung").click();
      });

      popover().within(() => {
        cy.findByText("Bestellungen").should("be.visible");
        cy.findByText("Produkt ID").should("be.visible");

        cy.findByText("Gesamtsumme").click();
      });
    });

    it("should translate content in sort step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("Bestellungen").click();
      });

      getSdkRoot().within(() => {
        cy.button("Sortieren").click();
      });

      popover().within(() => {
        cy.findByText("Benutzer ID").should("be.visible");

        cy.findByText("Gesamtsumme").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Gesamtsumme").should("be.visible");
      });
    });

    it("should translate content in join step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("Bestellungen").click();
      });

      getSdkRoot().within(() => {
        cy.button("Daten verknüpfen").click();
      });

      getSdkRoot().within(() => {
        cy.findByLabelText("Linke Tabelle").should("have.text", "Bestellungen");
      });

      popover().within(() => {
        cy.findByText("Personen").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Benutzer ID").click();
      });

      popover().within(() => {
        cy.findByText("Bestellungen").should("be.visible");

        cy.findByText("Produkt ID").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Kennung").click();
      });

      popover().within(() => {
        cy.findByText("Personen").should("be.visible");
        cy.findByText("Adresse").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Produkt ID").should("be.visible");
        cy.findByText("Adresse").should("be.visible");
      });
    });
  });
});
