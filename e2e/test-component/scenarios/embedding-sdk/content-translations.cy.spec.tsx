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
            msgstr: "DE-Question Embed SDK",
          },
          {
            locale: "de",
            msgid: "Product ID",
            msgstr: "DE-Product ID",
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
            cy.findByText("DE-Question Embed SDK").should("be.visible");
            cy.findByText("DE-Product ID").should("be.visible");
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
        { locale: "de", msgid: "Orders", msgstr: "DE-Orders" },
        { locale: "de", msgid: "Products", msgstr: "DE-Products" },
        { locale: "de", msgid: "People", msgstr: "DE-People" },
        { locale: "de", msgid: "Reviews", msgstr: "DE-Reviews" },
        // Column translations
        { locale: "de", msgid: "ID", msgstr: "DE-ID" },
        { locale: "de", msgid: "Total", msgstr: "DE-Total" },
        { locale: "de", msgid: "Tax", msgstr: "DE-Tax" },
        { locale: "de", msgid: "Quantity", msgstr: "DE-Quantity" },
        { locale: "de", msgid: "Discount", msgstr: "DE-Discount" },
        { locale: "de", msgid: "Created At", msgstr: "DE-Created At" },
        { locale: "de", msgid: "Product ID", msgstr: "DE-Product ID" },
        { locale: "de", msgid: "User ID", msgstr: "DE-User ID" },
        { locale: "de", msgid: "Subtotal", msgstr: "DE-Subtotal" },
        { locale: "de", msgid: "Address", msgstr: "DE-Address" },
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

      // "Pick your starting data" in German locale
      getSdkRoot().contains("Wähle deine Start-Daten");
    };

    it("should translate content in pick data step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        // Use .should("exist") instead of .should("be.visible") because
        // elements in scrollable popovers might be below the fold
        cy.findByText("DE-Products").should("exist");

        cy.findByText("DE-Orders").click();
      });

      getSdkRoot().within(() => {
        // "Add a filter to narrow down your answer" in German locale
        cy.findByText(
          "Füge Filter hinzu, um deine Antwort einzugrenzen",
        ).click();
      });

      popover().within(() => {
        cy.findByText("DE-Total").should("exist");
        cy.findByText("DE-Tax").should("exist");
        cy.findByText("DE-Quantity").should("exist");
      });
    });

    it("should translate content in filter step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("DE-Orders").click();
      });

      getSdkRoot().within(() => {
        cy.findByText(
          "Füge Filter hinzu, um deine Antwort einzugrenzen",
        ).click();
      });

      popover().within(() => {
        cy.findByText("DE-Total").click();
      });

      popover().within(() => {
        cy.findByTestId("number-filter-picker").within(() => {
          cy.findByText("DE-Total").should("be.visible");

          cy.findByPlaceholderText("Min").type("100");
          cy.findByPlaceholderText("Max").type("200");

          // "Add filter" in German locale
          cy.button("Füge einen Filter hinzu").click();
        });
      });

      getSdkRoot().within(() => {
        // "DE-Total is between 100 and 200" - filter display with translated column name
        cy.findByText("DE-Total ist zwischen 100 und 200").should("be.visible");
      });
    });

    it("should translate content in aggregation and breakout step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("DE-Orders").click();
      });

      getSdkRoot().within(() => {
        // "Pick a function or metric" in German locale
        cy.findByText("Wähle eine Funktion oder Metrik aus").click();
      });

      popover().within(() => {
        // "Sum of..." in German locale
        cy.findByText("Summe von...").click();

        cy.findByText("DE-Orders").should("exist");
        cy.findByText("DE-Discount").should("exist");
      });

      popover().within(() => {
        cy.findByText("DE-Total").click();
      });

      getSdkRoot().within(() => {
        // "Pick a column to group by" in German locale
        cy.findByText("Wähle eine Spalte für die Gruppierung").click();
      });

      popover().within(() => {
        cy.findByText("DE-Orders").should("exist");
        cy.findByText("DE-Product ID").should("exist");

        cy.findByText("DE-Total").click();
      });
    });

    it("should translate aggregation-related columns", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("DE-Orders").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Wähle eine Funktion oder Metrik aus").click();
      });

      popover().within(() => {
        cy.findByText("Summe von...").click();
        cy.findByText("DE-Total").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("Wähle eine Spalte für die Gruppierung").click();
      });

      popover().within(() => {
        cy.findByText("DE-Product ID").click();
      });

      getSdkRoot().within(() => {
        // "Visualize" in German locale
        cy.button("Darstellen").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          // "1 summary" in German locale
          cy.findByText("1 Zusammenfassung").click();
        });

        popover().within(() => {
          // "Sum of DE-Total" - aggregation pattern with translated column
          cy.findByText("Summe von DE-Total").should("be.visible");
        });

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          // "1 grouping" in German locale
          cy.findByText("1 Gruppierung").click();
        });

        popover().within(() => {
          cy.findByText("DE-Product ID").should("be.visible");
        });

        cy.findByTestId("table-header").within(() => {
          cy.findByText("DE-Product ID").should("be.visible");
          cy.findByText("Summe von DE-Total").should("be.visible");
        });
      });
    });

    it("should translate content in sort step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("DE-Orders").click();
      });

      getSdkRoot().within(() => {
        // "Sort" in German locale
        cy.button("Sortieren").click();
      });

      popover().within(() => {
        cy.findByText("DE-User ID").should("exist");

        cy.findByText("DE-Total").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("DE-Total").should("be.visible");
      });
    });

    it("should translate content in join step", () => {
      setupEditor();
      mountEditor();

      popover().within(() => {
        cy.findByText("DE-Orders").click();
      });

      getSdkRoot().within(() => {
        // "Join data" in German locale
        cy.button("Daten verknüpfen").click();
      });

      getSdkRoot().within(() => {
        // "Left table" in German locale
        cy.findByLabelText("Linke Tabelle").should("have.text", "DE-Orders");
      });

      popover().within(() => {
        cy.findByText("DE-People").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("DE-User ID").click();
      });

      popover().within(() => {
        cy.findByText("DE-Orders").should("exist");

        cy.findByText("DE-Product ID").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("DE-ID").click();
      });

      popover().within(() => {
        cy.findByText("DE-People").should("exist");
        cy.findByText("DE-Address").click();
      });

      getSdkRoot().within(() => {
        cy.findByText("DE-Product ID").should("be.visible");
        cy.findByText("DE-Address").should("be.visible");
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
        {
          locale: "de",
          msgid: "Test Collection",
          msgstr: "DE-Test Collection",
        },
        {
          locale: "de",
          msgid: "Test Dashboard",
          msgstr: "DE-Test Dashboard",
        },
        {
          locale: "de",
          msgid: "Dashboard description text",
          msgstr: "DE-Dashboard description text",
        },
        { locale: "de", msgid: "Test Question", msgstr: "DE-Test Question" },
        {
          locale: "de",
          msgid: "Question description text",
          msgstr: "DE-Question description text",
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
          cy.findByText("DE-Test Collection").should("be.visible");
          cy.findByText("DE-Test Dashboard").should("be.visible");
          cy.findByText("DE-Test Question").should("be.visible");
          cy.findByText("DE-Dashboard description text").should("be.visible");
          cy.findByText("DE-Question description text").should("be.visible");
        });
      });
    });
  });
});
