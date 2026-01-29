import {
  CollectionBrowser,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

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
        // Use .should("exist") instead of .should("be.visible") because
        // elements in scrollable popovers might be below the fold
        cy.findByText("Produkte").should("exist");

        cy.findByText("Bestellungen").click();
      });

      getSdkRoot().within(() => {
        cy.findByText(
          "Füge Filter hinzu, um deine Antwort einzugrenzen",
        ).click();
      });

      popover().within(() => {
        cy.findByText("Gesamtsumme").should("exist");
        cy.findByText("Steuer").should("exist");
        cy.findByText("Menge").should("exist");
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

        cy.findByText("Bestellungen").should("exist");
        cy.findByText("Rabatt").should("exist");
      });

      popover().within(() => {
        cy.findByText("Gesamtsumme").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Wähle eine Spalte für die Gruppierung").click();
      });

      popover().within(() => {
        cy.findByText("Bestellungen").should("exist");
        cy.findByText("Produkt ID").should("exist");

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
        cy.findByText("Benutzer ID").should("exist");

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
        cy.findByText("Bestellungen").should("exist");

        cy.findByText("Produkt ID").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Kennung").click();
      });

      popover().within(() => {
        cy.findByText("Personen").should("exist");
        cy.findByText("Adresse").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Produkt ID").should("be.visible");
        cy.findByText("Adresse").should("be.visible");
      });
    });
  });

  describe("collection browser", () => {
    it("should translate collection names, item names, and descriptions", () => {
      signInAsAdminAndEnableEmbeddingSdk();

      cy.request("POST", "/api/collection", {
        name: "Test Collection",
        parent_id: null,
      }).then(({ body: collection }) => {
        cy.wrap(collection.id).as("collectionId");

        cy.request("POST", "/api/dashboard", {
          name: "Test Dashboard",
          description: "Dashboard description text",
          collection_id: collection.id,
        });

        createQuestion({
          name: "Test Question",
          description: "Question description text",
          collection_id: collection.id,
          query: {
            "source-table": ORDERS_ID,
            limit: 1,
          },
        });
      });

      uploadTranslationDictionaryViaAPI([
        { locale: "de", msgid: "Test Collection", msgstr: "Test Sammlung" },
        {
          locale: "de",
          msgid: "Test Dashboard",
          msgstr: "Test Armaturenbrett",
        },
        {
          locale: "de",
          msgid: "Dashboard description text",
          msgstr: "Armaturenbrett Beschreibungstext",
        },
        { locale: "de", msgid: "Test Question", msgstr: "Testfrage" },
        {
          locale: "de",
          msgid: "Question description text",
          msgstr: "Frage Beschreibungstext",
        },
      ]);

      cy.signOut();
      mockAuthProviderAndJwtSignIn();

      cy.get("@collectionId").then((collectionId) => {
        mountSdkContent(
          <Flex p="xl">
            <CollectionBrowser
              collectionId={collectionId as unknown as number}
              visibleColumns={["type", "name", "description"]}
            />
          </Flex>,
          {
            sdkProviderProps: {
              locale: "de",
            },
          },
        );

        getSdkRoot().within(() => {
          cy.findByText("Test Sammlung").should("be.visible");
          cy.findByText("Test Armaturenbrett").should("be.visible");
          cy.findByText("Testfrage").should("be.visible");
          cy.findByText("Armaturenbrett Beschreibungstext").should(
            "be.visible",
          );
          cy.findByText("Frage Beschreibungstext").should("be.visible");
        });
      });
    });
  });
});
