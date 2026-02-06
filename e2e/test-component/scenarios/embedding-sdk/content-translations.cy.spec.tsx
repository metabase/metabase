import {
  CollectionBrowser,
  InteractiveQuestion,
} from "@metabase/embedding-sdk-react";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  openPopoverFromDefaultBucketSize,
  popover,
} from "e2e/support/helpers";
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
        { locale: "de", msgid: "Product", msgstr: "DE-Product" },
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
        { locale: "de", msgid: "Latitude", msgstr: "DE-Latitude" },
        { locale: "de", msgid: "Longitude", msgstr: "DE-Longitude" },
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

      getSdkRoot().within(() => {
        popover().within(() => {
          // Use .should("exist") instead of .should("be.visible") because
          // elements in scrollable popovers might be below the fold
          cy.findByText("DE-Products").should("exist");

          cy.findByText("DE-Orders").click();
        });

        // "Add a filter to narrow down your answer" in German locale
        cy.findByText(
          "Füge Filter hinzu, um deine Antwort einzugrenzen",
        ).click();

        popover().within(() => {
          cy.findByText("DE-Total").should("exist");
          cy.findByText("DE-Tax").should("exist");
          cy.findByText("DE-Quantity").should("exist");
        });
      });
    });

    describe("filter step", () => {
      it("should translate content for numberic field", () => {
        setupEditor();
        mountEditor();

        getSdkRoot().within(() => {
          popover().within(() => {
            cy.findByText("DE-Orders").click();
          });

          cy.findByText(
            "Füge Filter hinzu, um deine Antwort einzugrenzen",
          ).click();

          popover().within(() => {
            cy.findByText("DE-Total").click();

            cy.findByTestId("number-filter-picker").within(() => {
              cy.findByText("DE-Total").should("be.visible");

              cy.findByPlaceholderText("Min").type("100");
              cy.findByPlaceholderText("Max").type("200");

              // "Add filter" in German locale
              cy.button("Füge einen Filter hinzu").click();
            });
          });

          // "DE-Total is between 100 and 200" - filter display with translated column name
          cy.findByText("DE-Total ist zwischen 100 und 200").should(
            "be.visible",
          );

          // "Visualize" in German locale
          cy.button("Darstellen").click();

          cy.findByTestId("interactive-question-result-toolbar").within(() => {
            cy.findByText("1 Filter").click();
          });

          popover().within(() => {
            cy.findByText("DE-Total ist zwischen 100 und 200").should(
              "be.visible",
            );
          });
        });
      });

      it("should translate column name in second filter step after aggregation step", () => {
        setupEditor();
        mountEditor();

        getSdkRoot().within(() => {
          popover().within(() => {
            cy.findByText("DE-Orders").click();
          });

          cy.findByText("Wähle eine Funktion oder Metrik aus").click();

          popover().within(() => {
            cy.findByText("Anzahl eindeutiger Werte von...").click();
            cy.findByText("DE-Total").click();
          });

          cy.findByText("Wähle eine Spalte für die Gruppierung").click();

          popover().within(() => {
            cy.findByText("DE-Created At").click();
          });

          cy.findAllByTestId("action-buttons")
            .should("have.length", 2)
            .last()
            .within(() => {
              cy.findByText("Filter").click();
            });

          popover().within(() => {
            cy.findByText("DE-Created At: Monat").click();

            cy.findByText("DE-Created At: Monat").should("be.visible");
            cy.findByText("Vorherige 3 Monate").click();
          });

          // "Visualize" in German locale
          cy.button("Darstellen").click();

          cy.findByTestId("interactive-question-result-toolbar").within(() => {
            cy.findByText("1 Filter").click();
          });

          popover().within(() => {
            cy.findByText(
              "DE-Created At: Monat ist in der vorherige 3 monate",
            ).should("be.visible");
          });

          cy.findByTestId("chart-type-selector-button").click();

          popover().within(() => {
            cy.findByText("Tabelle").click();
          });

          cy.findByTestId("table-header").within(() => {
            cy.findByText("DE-Created At: Monat").should("be.visible");
          });
        });
      });

      it("should translate content for date field", () => {
        setupEditor();
        mountEditor();

        getSdkRoot().within(() => {
          popover().within(() => {
            cy.findByText("DE-People").click();
          });

          cy.findByText(
            "Füge Filter hinzu, um deine Antwort einzugrenzen",
          ).click();

          popover().within(() => {
            cy.findByText("DE-Created At").click();
          });

          cy.findByTestId("clause-popover").within(() => {
            cy.findByText("DE-Created At").should("be.visible");
          });
        });
      });
    });

    it("should translate content in aggregation and breakout step", () => {
      setupEditor();
      mountEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("DE-Orders").click();
        });

        // "Pick a function or metric" in German locale
        cy.findByText("Wähle eine Funktion oder Metrik aus").click();

        popover().within(() => {
          // "Sum of..." in German locale
          cy.findByText("Summe von...").click();

          cy.findByText("DE-Orders").should("exist");
          cy.findByText("DE-Discount").should("exist");

          cy.findByText("DE-Total").click();
        });

        // "Pick a column to group by" in German locale
        cy.findByText("Wähle eine Spalte für die Gruppierung").click();

        popover().within(() => {
          cy.findByText("DE-Orders").should("exist");
          cy.findByText("DE-Product ID").should("exist");

          cy.findByText("DE-Total").click();
        });
      });
    });

    it("should translate aggregation-related columns", () => {
      setupEditor();
      mountEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("DE-Orders").click();
        });

        cy.findByText("Wähle eine Funktion oder Metrik aus").click();

        popover().within(() => {
          cy.findByText("Summe von...").click();
          cy.findByText("DE-Total").click();
        });

        cy.findByText("Wähle eine Spalte für die Gruppierung").click();

        popover().within(() => {
          cy.findByText("DE-Product ID").click();
        });

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

    it("should translate columns with temporal bucket patterns", () => {
      setupEditor();
      mountEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("DE-Orders").click();
        });

        cy.findByText("Wähle eine Funktion oder Metrik aus").click();

        popover().within(() => {
          cy.findByText("Anzahl eindeutiger Werte von...").click();
          cy.findByText("DE-Total").click();
        });

        cy.findByText("Wähle eine Spalte für die Gruppierung").click();

        popover().within(() => {
          cy.findByText("DE-Created At").click();
        });

        // "Visualize" in German locale
        cy.button("Darstellen").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          // "1 grouping" in German locale
          cy.findByText("1 Gruppierung").click();
        });

        popover().within(() => {
          cy.findByText("DE-Created At").should("be.visible");
        });

        cy.findByTestId("chart-type-selector-button").click();

        popover().within(() => {
          cy.findByText("Tabelle").click();
        });

        cy.findByTestId("table-header").within(() => {
          cy.findByText("DE-Created At: Monat").should("be.visible");
        });
      });
    });

    it("should translate columns with binning patterns", () => {
      setupEditor();
      mountEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          // Select People table which has Latitude/Longitude fields
          cy.findByText("DE-People").click();
        });

        cy.findByText("Wähle eine Funktion oder Metrik aus").click();

        popover().within(() => {
          cy.findByText("Anzahl eindeutiger Werte von...").click();
          cy.findByText("DE-Latitude").click();
        });

        cy.findByTestId("step-summarize-0-0").within(() => {
          cy.findByText("Eindeutige Werte von DE-Latitude").should(
            "be.visible",
          );
        });

        cy.findByText("Wähle eine Spalte für die Gruppierung").click();

        popover().within(() => {
          openPopoverFromDefaultBucketSize(
            "DE-Latitude",
            "Automatische Klasseneinteilung",
          );

          cy.findByText("Eine Klasse pro 10 Grad").click();
        });

        cy.findByText("DE-Latitude: 10°").should("be.visible");

        // "Visualize" in German locale
        cy.button("Darstellen").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          // "1 grouping" in German locale
          cy.findByText("1 Gruppierung").click();
        });

        popover().within(() => {
          cy.findByText("DE-Latitude").should("be.visible");
        });

        cy.findByTestId("chart-type-selector-button").click();

        popover().within(() => {
          cy.findByText("Tabelle").click();
        });

        cy.findByTestId("table-header").within(() => {
          cy.findByText("DE-Latitude: 10°").should("be.visible");
        });
      });
    });

    it("should translate aggregation-related columns for joined tables", () => {
      setupEditor();
      mountEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("DE-Orders").click();
        });

        // "Join data" in German locale
        cy.button("Daten verknüpfen").click();

        popover().within(() => {
          cy.findByText("DE-People").click();
        });

        cy.findByText("DE-User ID").click();

        popover().within(() => {
          cy.findByText("DE-Product ID").click();
        });

        cy.findByText("DE-ID").click();

        popover().within(() => {
          cy.findByText("DE-ID").click();
        });

        cy.findByText("Wähle eine Funktion oder Metrik aus").click();

        popover().within(() => {
          cy.findByText("Anzahl eindeutiger Werte von...").click();
          cy.findByText("DE-People").click();

          cy.findByText("DE-Created At").click();
        });

        cy.findByTestId("step-summarize-0-0").within(() => {
          cy.findByText(
            "Eindeutige Werte von DE-People - DE-Product → DE-Created At: Monat",
          ).should("be.visible");
        });

        cy.findByText("Wähle eine Spalte für die Gruppierung").click();

        popover().within(() => {
          cy.findByText("DE-People").click();
          cy.findByText("DE-Created At").click();
        });

        cy.findByText("DE-People - DE-Product → DE-Created At: Monat").should(
          "be.visible",
        );

        // "Visualize" in German locale
        cy.button("Darstellen").click();

        cy.findByTestId("interactive-question-top-toolbar").within(() => {
          cy.findByText(
            "Eindeutige Werte von People - Product → Created At: Monat von People - Product → Created At: Monat",
          ).should("be.visible");
        });

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          // "1 grouping" in German locale
          cy.findByText("1 Gruppierung").click();
        });

        popover().within(() => {
          cy.findByText("DE-People - DE-Product → DE-Created At").should(
            "be.visible",
          );
        });

        cy.findByTestId("chart-type-selector-button").click();

        popover().within(() => {
          cy.findByText("Tabelle").click();
        });

        cy.findByTestId("table-header").within(() => {
          cy.findByText("DE-People - DE-Product → DE-Created At: Monat").should(
            "be.visible",
          );
          cy.findByText(
            "Eindeutige Werte von DE-People - DE-Product → DE-Created At: Monat",
          ).should("be.visible");
        });
      });
    });

    it("should translate content in sort step", () => {
      setupEditor();
      mountEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("DE-Orders").click();
        });

        // "Sort" in German locale
        cy.button("Sortieren").click();

        popover().within(() => {
          cy.findByText("DE-User ID").should("exist");

          cy.findByText("DE-Total").click();
        });

        cy.findByText("DE-Total").should("be.visible");
      });
    });

    it("should translate content in join step", () => {
      setupEditor();
      mountEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("DE-Orders").click();
        });

        // "Join data" in German locale
        cy.button("Daten verknüpfen").click();

        // "Left table" in German locale
        cy.findByLabelText("Linke Tabelle").should("have.text", "DE-Orders");

        popover().within(() => {
          cy.findByText("DE-People").click();
        });

        cy.findByText("DE-User ID").click();

        popover().within(() => {
          cy.findByText("DE-Orders").should("exist");

          cy.findByText("DE-Product ID").click();
        });

        cy.findByText("DE-ID").click();

        popover().within(() => {
          cy.findByText("DE-People").should("exist");
          cy.findByText("DE-Address").click();
        });

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
