import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ALL_USERS_GROUP_ID } from "e2e/support/cypress_sample_instance_data";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
import type { CollectionPermission } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const READ: CollectionPermission = "read";
const NONE: CollectionPermission = "none";

const setupEmbed = (elementHtml: string) => {
  cy.intercept("GET", "/api/collection/*").as("getCollection");

  H.visitCustomHtmlPage(`
    ${H.getNewEmbedScriptTag()}
    ${H.getNewEmbedConfigurationScript({})}
    ${elementHtml}
  `);
};

describe("scenarios > embedding > sdk iframe embedding > metabase-browser", () => {
  describe("collection permissions", () => {
    it("should show an error when initial-collection points to a collection the user has no access to", () => {
      cy.signInAsAdmin();
      H.prepareSdkIframeEmbedTest({ withToken: "bleeding-edge" });

      H.createCollection({
        name: "Restricted Collection",
      }).then(({ body: collection }) => {
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP_ID]: {
            root: READ,
            [collection.id]: NONE,
          },
        });

        mockAuthProviderAndJwtSignIn(USERS.nocollection);

        setupEmbed(`
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `);

        cy.wait("@getCollection");

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("New exploration").should("not.exist");
        });
      });
    });

    it("should not allow saving when user has no curate permissions on initial-collection (reproduces the bug)", () => {
      cy.signInAsAdmin();
      H.prepareSdkIframeEmbedTest({ withToken: "bleeding-edge" });

      H.createCollection({
        name: "Read Only Collection",
      }).then(({ body: collection }) => {
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP_ID]: {
            root: READ,
            [collection.id]: READ,
          },
        });

        H.createQuestion({
          name: "Test Question",
          query: { "source-table": ORDERS_ID },
          collection_id: collection.id,
        });

        mockAuthProviderAndJwtSignIn(USERS.nocollection);

        setupEmbed(`
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `);

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("New exploration").should("be.visible").click();

          cy.findByText("Pick your starting data").should("be.visible");
          cy.findByText("Orders").click();

          cy.findByRole("button", { name: "Visualize" }).should("be.visible");

          cy.findByRole("button", { name: "Visualize" }).click();

          cy.findByTestId("visualization-root").should("be.visible");

          cy.findByText("Save").should("not.exist");
        });
      });
    });
  });
});
