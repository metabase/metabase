import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { uploadTranslationDictionaryViaAPI } from "e2e/support/helpers/e2e-content-translation-helpers";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const setupEmbed = (elementHtml: string) => {
  H.visitCustomHtmlPage(`
    ${H.getNewEmbedScriptTag()}
    ${H.getNewEmbedConfigurationScript({ locale: "de" })}
    ${elementHtml}
  `);
};

describe("scenarios > embedding > sdk iframe embedding > content-translations", () => {
  describe("metabase-browser", () => {
    const setupContentTranslations = () => {
      H.createCollection({
        name: "Test Collection",
        description: "Test description",
      }).then(({ body: collection }) => {
        cy.wrap(collection.id).as("collectionId");

        H.createDashboard({
          name: "Test Dashboard",
          description: "Dashboard description text",
          collection_id: collection.id,
        });

        H.createQuestion({
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
          msgid: "Test description",
          msgstr: "Testbeschreibung",
        },
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
    };

    it("should translate content with read-only='true'", () => {
      H.prepareSdkIframeEmbedTest({
        withToken: "bleeding-edge",
        signOut: false,
      });

      setupContentTranslations();

      cy.get("@collectionId").then((collectionId) => {
        setupEmbed(`
          <metabase-browser
            initial-collection="${collectionId}"
            read-only="true"
          />
        `);

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByTestId("sdk-breadcrumbs").within(() => {
            cy.findByText("Test Sammlung").should("be.visible");
          });

          cy.findByTestId("collection-table").within(() => {
            cy.findByText("Test Armaturenbrett").should("be.visible");
            cy.findByText("Testfrage").should("be.visible");

            cy.findByText("Testfrage").click();
          });

          cy.findByTestId("sdk-breadcrumbs").within(() => {
            cy.findByText("Test Sammlung").should("be.visible");
            cy.findByText("Testfrage").should("be.visible");
          });
        });
      });
    });

    it("should translate content with read-only='false'", () => {
      H.prepareSdkIframeEmbedTest({
        withToken: "bleeding-edge",
        signOut: false,
      });

      setupContentTranslations();

      cy.get("@collectionId").then((collectionId) => {
        setupEmbed(`
          <metabase-browser
            initial-collection="${collectionId}"
            read-only="false"
          />
        `);

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Neues Dashboard").click();

          H.modal().within(() => {
            cy.findByText("Test Sammlung").should("be.visible");
            cy.findByText("Test Sammlung").click();
          });

          H.modal()
            .should("have.length", 2)
            .last()
            .within(() => {
              cy.findAllByTestId("result-item").first().should("be.visible");

              cy.findAllByTestId("result-item")
                .first()
                .within(() => {
                  cy.icon("info").click();
                });
            });

          H.tooltip().should("contain", "Testbeschreibung");

          H.modal()
            .should("have.length", 2)
            .last()
            .within(() => {
              cy.findByText("Sammlungen").click();
              cy.findByText("Test Sammlung").should("be.visible");
            });
        });
      });
    });
  });
});
