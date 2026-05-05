import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, getSignedJwtForResource } from "e2e/support/helpers";
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

        H.getSimpleEmbedIframeContent()
          .findByText("Testfrage")
          .should("be.visible");

        H.getSimpleEmbedIframeContent()
          .findByText("Neues Dashboard")
          .should("be.visible")
          .click();

        H.getSimpleEmbedIframeContent().within(() => {
          H.modal().findByText("Test Sammlung").should("be.visible").click();
          H.entityPickerModal()
            .findByText("Test Sammlung")
            .should("be.visible");
        });
      });
    });
  });

  // Regression test for EMB-1478: a guest embed under a non-English instance
  // locale used to fire setEndpointsForAuthEmbedding() on the first render
  // (before isGuestEmbed had propagated through the redux store), corrupting
  // the dictionary endpoint to the auth path. The signed-out guest visitor
  // then got 401s on /api/ee/content-translation/dictionary and the title
  // never translated.
  describe("guest embed (EMB-1478)", { tags: "@EE" }, () => {
    it("translates question title for a signed-out guest when site-locale is non-English", () => {
      H.prepareGuestEmbedSdkIframeEmbedTest({
        onPrepare: () => {
          // Required to trigger the bug: useLocale() returns the instance
          // locale on the first render, and the buggy code path only fires
          // when that value is non-English.
          H.updateSetting("site-locale", "de");

          uploadTranslationDictionaryViaAPI([
            {
              locale: "de",
              msgid: "EMB-1478 question",
              msgstr: "EMB-1478 Frage",
            },
          ]);

          createQuestion({
            name: "EMB-1478 question",
            enable_embedding: true,
            embedding_type: "guest-embed",
            query: {
              "source-table": ORDERS_ID,
              limit: 1,
            },
          }).then(({ body: question }) => {
            cy.wrap(question.id).as("questionId");
          });
        },
      });

      // Regex (not glob) so the matcher covers both /dictionary?... and
      // /dictionary/<jwt>?... — minimatch's `*` does not cross `/`.
      cy.intercept(
        "GET",
        /\/api\/ee\/content-translation\/dictionary(\/|\?)/,
      ).as("getDictionary");

      cy.get("@questionId").then(async (questionId) => {
        const token = await getSignedJwtForResource({
          resourceId: questionId as unknown as number,
          resourceType: "question",
        });

        const frame = H.loadSdkIframeEmbedTestPage({
          metabaseConfig: { isGuest: true },
          elements: [
            {
              component: "metabase-question",
              attributes: {
                token,
                "with-title": true,
              },
            },
          ],
        });

        // The dictionary fetch must include the JWT segment. Without the fix
        // it would hit /dictionary?locale=de and return 401 for the guest.
        cy.wait("@getDictionary")
          .its("request.url")
          .should("include", `/dictionary/${token}`);

        frame.findByText("EMB-1478 Frage").should("be.visible");
      });
    });
  });
});
