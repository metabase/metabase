import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { DATA_GROUP_ID } from "e2e/support/cypress_sample_instance_data";
import type { CollectionPermission } from "metabase-types/api";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const READ: CollectionPermission = "read";
const NONE: CollectionPermission = "none";

const setupEmbed = (elementHtml: string) => {
  H.visitCustomHtmlPage(`
    ${H.getNewEmbedScriptTag()}
    ${H.getNewEmbedConfigurationScript({})}
    ${elementHtml}
  `);
};

describe("scenarios > embedding > sdk iframe embedding > metabase-browser", () => {
  describe("collection permissions", () => {
    it("should show an error when initial-collection points to a collection the user has no access to", () => {
      H.prepareSdkIframeEmbedTest({
        withToken: "bleeding-edge",
        signOut: false,
      });

      H.createCollection({
        name: "Restricted Collection",
      }).then(({ body: collection }) => {
        cy.updateCollectionGraph({
          [DATA_GROUP_ID]: {
            root: READ,
            [collection.id]: NONE,
          },
        });

        cy.signIn("nocollection");

        setupEmbed(`
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `);

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("You don't have access to this collection").should(
            "be.visible",
          );
          cy.findByText("New exploration").should("not.exist");
        });
      });
    });

    it("should not show New exploration button when user has no curate permissions on initial-collection", () => {
      H.prepareSdkIframeEmbedTest({
        withToken: "bleeding-edge",
        signOut: false,
      });

      H.createCollection({
        name: "Read Only Collection",
      }).then(({ body: collection }) => {
        cy.updateCollectionGraph({
          [DATA_GROUP_ID]: {
            root: READ,
            [collection.id]: READ,
          },
        });

        H.createQuestion({
          name: "Test Question",
          query: { "source-table": ORDERS_ID },
          collection_id: collection.id,
        });

        cy.signIn("nocollection");

        setupEmbed(`
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `);

        H.getSimpleEmbedIframeContent().within(() => {
          // User can see the collection contents (they have read access)
          cy.findByText("Test Question").should("be.visible");

          // But New exploration button should be hidden since they can't save
          cy.findByText("New exploration").should("not.exist");
        });
      });
    });

    it("should not show Save button when opening an existing question from a read-only collection", () => {
      H.prepareSdkIframeEmbedTest({
        withToken: "bleeding-edge",
        signOut: false,
      });

      H.createCollection({
        name: "Read Only Collection",
      }).then(({ body: collection }) => {
        cy.updateCollectionGraph({
          [DATA_GROUP_ID]: {
            root: READ,
            [collection.id]: READ,
          },
        });

        H.createQuestion({
          name: "Test Question",
          query: { "source-table": ORDERS_ID },
          collection_id: collection.id,
        });

        cy.signIn("nocollection");

        setupEmbed(`
          <metabase-browser
            initial-collection="${collection.id}"
            read-only="false"
          />
        `);

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByText("Test Question").should("be.visible").click();

          cy.findByTestId("visualization-root").should("be.visible");

          cy.findByTestId("interactive-question-result-toolbar")
            .findByText("Filter")
            .click();
        });

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findAllByTestId("dimension-list-item").findByText("ID").click();
          cy.findByPlaceholderText("Enter an ID").type("1");
          cy.findByText("Add filter").click();
        });

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByRole("button", { name: "Save" }).should("not.exist");
        });
      });
    });
  });

  it("should reset `Exploration` editor state when clicking 'new exploration' breadcrumb after selecting a filter", () => {
    H.prepareSdkIframeEmbedTest({
      withToken: "bleeding-edge",
      signOut: false,
    });

    setupEmbed(`
        <metabase-browser
          initial-collection="root"
          read-only="false"
        />
      `);

    H.getSimpleEmbedIframeContent().within(() => {
      cy.log("Clicking New exploration");
      cy.findByText("New exploration").click();

      cy.log("Waiting for Pick your starting data (first time)");
      cy.findByText("Pick your starting data").should("be.visible");

      cy.intercept("GET", "/api/table/*/query_metadata").as("tableMetadata");
      cy.log("Clicking Orders");
      cy.findByText("Orders").click();

      cy.log("Waiting for @tableMetadata intercept");
      cy.wait("@tableMetadata");
      cy.log("@tableMetadata resolved");

      cy.findByTestId("data-step-cell").should("have.text", "Orders");
      cy.log("data-step-cell confirmed Orders");

      cy.log("About to click breadcrumb");
      // Click the parent Badge element which has the onClick handler,
      // not the inner text span that findByText resolves to
      cy.findByTestId("sdk-breadcrumbs")
        .findByText("New exploration")
        .parent()
        .click();
      cy.log("Breadcrumb clicked");

      cy.log("Waiting for Pick your starting data (second time)");
      cy.findByText("Pick your starting data").should("be.visible");
      cy.findByText("Orders").should("not.exist");
    });
  });
});
