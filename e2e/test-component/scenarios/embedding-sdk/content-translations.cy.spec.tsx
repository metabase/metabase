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
import type { Card } from "metabase-types/api";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > embedding-sdk > content-translations", () => {
  beforeEach(() => {
    cy.intercept("GET", "/app/locales/de.json", {
      body: {
        charset: "utf-8",
        headers: {
          "mime-version": "1.0",
          "x-crowdin-file-id": "2",
          "language-team": "German",
          "content-type": "text/plain; charset=UTF-8",
          "po-revision-date": "2026-04-01 16:19",
          "report-msgid-bugs-to": "docs@metabase.com",
          "x-crowdin-project": "metabase-i18n",
          "pot-creation-date": "2026-04-01 14:56+0000",
          "content-transfer-encoding": "8bit",
          language: "de",
          "x-crowdin-file": "metabase.po",
          "x-crowdin-language": "de",
          "plural-forms": "nplurals=2; plural=(n != 1);",
          "project-id-version": "metabase-i18n",
          "x-crowdin-project-id": "758295",
        },
        translations: {
          "": {},
        },
      },
    });

    cy.intercept("GET", "/app/locales/ar.json", {
      body: {
        charset: "utf-8",
        headers: {
          "mime-version": "1.0",
          "x-crowdin-file-id": "2",
          "language-team": "Arabic",
          "content-type": "text/plain; charset=UTF-8",
          "po-revision-date": "2026-04-01 16:19",
          "report-msgid-bugs-to": "docs@metabase.com",
          "x-crowdin-project": "metabase-i18n",
          "pot-creation-date": "2026-04-01 14:56+0000",
          "content-transfer-encoding": "8bit",
          language: "ar",
          "x-crowdin-file": "metabase.po",
          "x-crowdin-language": "ar",
          "plural-forms":
            "nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 && n%100<=99 ? 4 : 5);",
          "project-id-version": "metabase-i18n",
          "x-crowdin-project-id": "758295",
        },
        translations: {
          "": {},
        },
      },
    });
  });

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
        <div style={{ display: "flex", padding: "20px" }}>
          <InteractiveQuestion questionId="new" />
        </div>,
        {
          sdkProviderProps: {
            locale: "de",
          },
        },
      );

      getSdkRoot().contains("Pick your starting data");
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

        cy.findByText("Add filters to narrow your answer").click();

        popover().within(() => {
          cy.findByText("DE-Total").should("exist");
          cy.findByText("DE-Tax").should("exist");
          cy.findByText("DE-Quantity").should("exist");
        });
      });
    });

    describe("filter step", () => {
      it("should translate content for numeric field", () => {
        setupEditor();
        mountEditor();

        getSdkRoot().within(() => {
          popover().within(() => {
            cy.findByText("DE-Orders").click();
          });

          cy.findByText("Add filters to narrow your answer").click();

          popover().within(() => {
            cy.findByText("DE-Total").should("be.visible");

            cy.findByTestId("list-search-field").type("Total");
            cy.findByText("DE-Total").should("not.exist");
            cy.findByText("Total").should("be.visible");

            cy.findByTestId("list-search-field").clear();
            cy.findByText("DE-Total").click();

            cy.findByTestId("number-filter-picker").within(() => {
              cy.findByText("DE-Total").should("be.visible");

              cy.findByPlaceholderText("Min").type("100");
              cy.findByPlaceholderText("Max").type("200");

              cy.button("Add filter").click();
            });
          });

          cy.findByText("DE-Total is between 100 and 200").should("be.visible");

          cy.button("Visualize").click();

          cy.findByTestId("interactive-question-result-toolbar").within(() => {
            cy.findByText("1 filter").click();
          });

          popover().within(() => {
            cy.findByText("DE-Total is between 100 and 200").should(
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

          cy.findByText("Pick a function or metric").click();

          popover().within(() => {
            cy.findByText("Number of distinct values of ...").click();
            cy.findByText("DE-Total").click();
          });

          cy.findByText("Pick a column to group by").click();

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
            cy.findByText("DE-Created At: Month").click();

            cy.findByText("DE-Created At: Month").should("be.visible");
            cy.findByText("Previous 3 months").click();
          });

          cy.button("Visualize").click();

          cy.findByTestId("interactive-question-result-toolbar").within(() => {
            cy.findByText("1 filter").click();
          });

          popover().within(() => {
            cy.findByText(
              "DE-Created At: Month is in the previous 3 months",
            ).should("be.visible");
          });

          cy.findByTestId("chart-type-selector-button").click();

          popover().within(() => {
            cy.findByText("Table").click();
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

          cy.findByText("Add filters to narrow your answer").click();

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

        cy.findByText("Pick a function or metric").click();

        popover().within(() => {
          cy.findByText("Sum of ...").click();

          cy.findByText("DE-Orders").should("exist");
          cy.findByText("DE-Discount").should("exist");

          cy.findByText("DE-Total").click();
        });

        cy.findByText("Pick a column to group by").click();

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

        cy.findByText("Pick a function or metric").click();

        popover().within(() => {
          cy.findByText("Sum of ...").click();
          cy.findByText("DE-Total").click();
        });

        cy.findByText("Pick a column to group by").click();

        popover().within(() => {
          cy.findByText("DE-Product ID").click();
        });

        cy.button("Visualize").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("1 summary").click();
        });

        popover().within(() => {
          // "Sum of DE-Total" - aggregation pattern with translated column
          cy.findByText("Sum of DE-Total").should("be.visible");
        });

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("1 grouping").click();
        });

        popover().within(() => {
          cy.findByText("DE-Product ID").should("be.visible");
        });

        cy.findByTestId("table-header").within(() => {
          cy.findByText("DE-Product ID").should("be.visible");
          // This still uses DE i18n translation, as this values comes from BE, so we skip this part
          /*cy.findByText("Summe von DE-Total").should("be.visible");*/
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

        cy.findByText("Pick a function or metric").click();

        popover().within(() => {
          cy.findByText("Number of distinct values of ...").click();
          cy.findByText("DE-Total").click();
        });

        cy.findByText("Pick a column to group by").click();

        popover().within(() => {
          cy.findByText("DE-Created At").click();
        });

        cy.button("Visualize").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("1 grouping").click();
        });

        popover().within(() => {
          cy.findByText("DE-Created At").should("be.visible");
        });

        cy.findByTestId("chart-type-selector-button").click();

        popover().within(() => {
          cy.findByText("Table").click();
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

        cy.findByText("Pick a function or metric").click();

        popover().within(() => {
          cy.findByText("Number of distinct values of ...").click();
          cy.findByText("DE-Latitude").click();
        });

        cy.findByTestId("step-summarize-0-0").within(() => {
          cy.findByText("Distinct values of DE-Latitude").should("be.visible");
        });

        cy.findByText("Pick a column to group by").click();

        popover().within(() => {
          openPopoverFromDefaultBucketSize("DE-Latitude", "Auto bin");

          cy.findByText("Bin every 10 degrees").click();
        });

        cy.findByText("DE-Latitude: 10°").should("be.visible");

        cy.button("Visualize").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("1 grouping").click();
        });

        popover().within(() => {
          cy.findByText("DE-Latitude").should("be.visible");
        });

        cy.findByTestId("chart-type-selector-button").click();

        popover().within(() => {
          cy.findByText("Table").click();
        });

        cy.findByTestId("table-header").within(() => {
          // This still uses DE i18n translation, as this values comes from BE, so we skip this part
          /*cy.findByText("DE-Latitude: 10°").should("be.visible");*/
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

        cy.button("Join data").click();

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

        cy.findByText("Pick a function or metric").click();

        popover().within(() => {
          cy.findByText("Number of distinct values of ...").click();
          cy.findByText("DE-People").click();

          cy.findByText("DE-Created At").click();
        });

        cy.findByTestId("step-summarize-0-0").within(() => {
          cy.findByText(
            "Distinct values of DE-People - DE-Product → DE-Created At: Month",
          ).should("be.visible");
        });

        cy.findByText("Pick a column to group by").click();

        popover().within(() => {
          cy.findByText("DE-People").click();
          cy.findByText("DE-Created At").click();
        });

        cy.findByText("DE-People - DE-Product → DE-Created At: Month").should(
          "be.visible",
        );

        cy.button("Visualize").click();

        cy.findByTestId("interactive-question-top-toolbar").within(() => {
          cy.findByText(
            // Currently we receive from BE display names with translated static parts and untranslated table/column names
            // It's currently unclear what we should do for such ad-hock question names:
            // - fully translate them, taking in mind that the same translated name is added to the Save Question modal
            // - ignore translation for such names at all
            "Distinct values of People - Product → Created At: Month by People - Product → Created At: Month",
          ).should("be.visible");
        });

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("1 grouping").click();
        });

        popover().within(() => {
          cy.findByText("DE-People - DE-Product → DE-Created At").should(
            "be.visible",
          );
        });

        cy.findByTestId("chart-type-selector-button").click();

        popover().within(() => {
          cy.findByText("Table").click();
        });

        cy.findByTestId("table-header").within(() => {
          cy.findByText("DE-People - DE-Product → DE-Created At: Monat").should(
            "be.visible",
          );
          // This still uses DE i18n translation, as this values comes from BE, so we skip this part
          /*cy.findByText(
            "Eindeutige Werte von DE-People - DE-Product → DE-Created At: Monat",
          ).should("be.visible");*/
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

        cy.button("Sort").click();

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

        cy.button("Join data").click();

        cy.findByLabelText("Left table").should("have.text", "DE-Orders");

        popover().within(() => {
          cy.findByText("DE-People").click();
        });

        cy.findByText("DE-User ID").click();

        popover().within(() => {
          cy.findByText("DE-Orders").should("be.visible");

          cy.findByTestId("list-search-field").type("Product ID");
          cy.findByText("DE-Product ID").should("not.exist");
          cy.findByText("Product ID").should("be.visible");

          cy.findByTestId("list-search-field").clear();
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

  describe("RTL locale (Arabic)", () => {
    const setupArabicEditor = () => {
      signInAsAdminAndEnableEmbeddingSdk();

      uploadTranslationDictionaryViaAPI([
        // Table translations
        { locale: "ar", msgid: "Orders", msgstr: "AR-Orders" },
        { locale: "ar", msgid: "Products", msgstr: "AR-Products" },
        { locale: "ar", msgid: "People", msgstr: "AR-People" },
        // Column translations
        { locale: "ar", msgid: "Total", msgstr: "AR-Total" },
        { locale: "ar", msgid: "Tax", msgstr: "AR-Tax" },
        { locale: "ar", msgid: "Quantity", msgstr: "AR-Quantity" },
        { locale: "ar", msgid: "Created At", msgstr: "AR-Created At" },
        { locale: "ar", msgid: "Product ID", msgstr: "AR-Product ID" },
      ]);

      cy.signOut();
    };

    const mountArabicEditor = () => {
      mockAuthProviderAndJwtSignIn();

      mountSdkContent(
        <div style={{ display: "flex", padding: "20px" }}>
          <InteractiveQuestion questionId="new" />
        </div>,
        {
          sdkProviderProps: {
            locale: "ar",
          },
        },
      );

      getSdkRoot().contains("Pick your starting data");
    };

    it("should translate aggregation-related columns in RTL locale", () => {
      setupArabicEditor();
      mountArabicEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("AR-Orders").click();
        });

        cy.findByText("Pick a function or metric").click();

        popover().within(() => {
          cy.findByText("Sum of ...").click();
          cy.findByText("AR-Total").click();
        });

        cy.findByText("Pick a column to group by").click();

        popover().within(() => {
          cy.findByText("AR-Product ID").click();
        });

        cy.button("Visualize").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("1 summary").click();
        });

        popover().within(() => {
          cy.findByText("Sum of AR-Total").should("be.visible");
        });

        cy.findByTestId("chart-type-selector-button").click();

        popover().within(() => {
          cy.findByText("Table").click();
        });

        cy.findByTestId("table-header").within(() => {
          cy.findByText("AR-Product ID").should("be.visible");

          // This still uses AR i18n translation, as this values comes from BE, so we skip this part
          /*cy.findByText("مجموع AR-Total").should("be.visible");*/
        });
      });
    });

    it("should translate filter display name in RTL locale", () => {
      setupArabicEditor();
      mountArabicEditor();

      getSdkRoot().within(() => {
        popover().within(() => {
          cy.findByText("AR-Orders").click();
        });

        cy.findByText("Add filters to narrow your answer").click();

        popover().within(() => {
          cy.findByText("AR-Total").click();

          cy.findByTestId("number-filter-picker").within(() => {
            cy.findByText("AR-Total").should("be.visible");

            cy.findByPlaceholderText("Min").type("100");
            cy.findByPlaceholderText("Max").type("200");

            cy.button("Add filter").click();
          });
        });

        cy.findByText("AR-Total is between 100 and 200").should("be.visible");

        cy.button("Visualize").click();

        cy.findByTestId("interactive-question-result-toolbar").within(() => {
          cy.findByText("1 filter").click();
        });

        popover().within(() => {
          cy.findByText("AR-Total is between 100 and 200").should("be.visible");
        });
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
          <div style={{ display: "flex", padding: "20px" }}>
            <CollectionBrowser
              collectionId={collectionId as unknown as number}
              visibleColumns={["type", "name", "description"]}
            />
          </div>,
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
