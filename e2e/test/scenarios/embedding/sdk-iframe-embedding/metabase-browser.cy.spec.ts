import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { DATA_GROUP_ID } from "e2e/support/cypress_sample_instance_data";
import { JWT_SHARED_SECRET } from "e2e/support/helpers/e2e-jwt-helpers";
import { mockAuthProviderAndJwtSignIn } from "e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers";
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
          cy.findByText("New question").should("not.exist");
        });
      });
    });

    it("should not show New question button when user has no curate permissions on initial-collection", () => {
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

          // But New question button should be hidden since they can't save
          cy.findByText("New question").should("not.exist");
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

  describe('initial-collection="all"', () => {
    const SHARED_TENANT_NAMESPACE = "shared-tenant-collection";

    const TENANT = { name: "Acme", slug: "acme" };

    const TENANT_USER = {
      first_name: "Tina",
      last_name: "Tenanton",
      email: "tenant@metabase.test",
      "@tenant": TENANT.slug,
    };

    const createSharedCollection = (name: string, parentId?: number) =>
      cy.request("POST", "/api/collection", {
        name,
        namespace: SHARED_TENANT_NAMESPACE,
        parent_id: parentId ?? null,
      });

    const setUpTenantsInstance = () => {
      H.prepareSdkIframeEmbedTest({ signOut: false });
      H.updateSetting("use-tenants", true);

      createSharedCollection("Shared Reports").then(({ body: collection }) => {
        createSharedCollection("Shared Sub-Collection", collection.id);
      });
    };

    const embedAllCollections = () =>
      setupEmbed(`
        <metabase-browser
          initial-collection="all"
          read-only="false"
        />
      `);

    describe("for a normal user", () => {
      beforeEach(() => {
        H.prepareSdkIframeEmbedTest({ signOut: false });

        cy.signOut();
        mockAuthProviderAndJwtSignIn(USERS.normal);
      });

      it("should list the reachable roots, drill into one and come back", () => {
        embedAllCollections();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.log("the personal collection sits beside `Our analytics`");
          cy.findByTestId("all-collections-list").within(() => {
            cy.findByText("Our analytics").should("be.visible");
            cy.findByText("Your personal collection").should("be.visible");
          });

          cy.log("`Our analytics` opens and shows its contents");
          cy.findByText("Our analytics").click();
          // wait for the navigation out of the virtual root
          cy.findByTestId("all-collections-list").should("not.exist");
          cy.findByText("Orders in a dashboard").should("be.visible");

          cy.log("the `All collections` crumb returns to the virtual root");
          cy.findByTestId("sdk-breadcrumbs")
            .findByText("All collections")
            .click();
          cy.findByTestId("all-collections-list")
            .findByText("Your personal collection")
            .click();

          cy.log("the personal collection does not sit under `Our analytics`");
          cy.findByTestId("sdk-breadcrumbs")
            .findByText("Our analytics")
            .should("not.exist");
        });
      });
    });

    describe("for a tenant user", () => {
      beforeEach(() => {
        setUpTenantsInstance();

        cy.request("PUT", "/api/setting", {
          "jwt-user-provisioning-enabled?": true,
        });
        cy.request("POST", "/api/ee/tenant", TENANT);

        cy.signOut();

        cy.task<string>("signJwt", {
          payload: {
            ...TENANT_USER,
            exp: Math.round(Date.now() / 1000) + 10 * 60,
          },
          secret: JWT_SHARED_SECRET,
        }).then((jwt) => mockAuthProviderAndJwtSignIn(undefined, { jwt }));
      });

      it("should list Our data and the shared tenant collections, and drill into them", () => {
        embedAllCollections();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.log("the tenant collection shows up as `Our data`");
          cy.findByTestId("all-collections-list").within(() => {
            cy.findByText("Shared Reports").should("be.visible");
            cy.findByText("Our data").should("be.visible");
            cy.findByText("Your personal collection").should("be.visible");
          });

          cy.log("the shallow tree lists only the top level, not the children");
          cy.findByText("Shared Sub-Collection").should("not.exist");

          cy.log("a shared tenant collection opens like any other row");
          cy.findByText("Shared Reports").click();
          // wait for the navigation out of the virtual root
          cy.findByTestId("all-collections-list").should("not.exist");
          cy.findByText("Shared Sub-Collection").should("be.visible");
          cy.findByTestId("sdk-breadcrumbs")
            .findByText("Our analytics")
            .should("not.exist");

          cy.log("`Our data` opens the same way");
          cy.findByTestId("sdk-breadcrumbs")
            .findByText("All collections")
            .click();
          cy.findByTestId("all-collections-list")
            .findByText("Our data")
            .click();
          cy.findByTestId("all-collections-list").should("not.exist");
          cy.findByTestId("sdk-breadcrumbs").within(() => {
            cy.findByText("All collections").should("be.visible");
            cy.findByText("Our analytics").should("not.exist");
          });
        });
      });
    });

    describe("for a user with no access to the root", () => {
      it("should promote the collections below the root, drill into one and come back", () => {
        H.prepareSdkIframeEmbedTest({ signOut: false });

        H.createCollection({ name: "Accessible Collection" }).then(
          ({ body: collection }) => {
            H.createDashboard({
              name: "Accessible Dashboard",
              collection_id: collection.id,
            });

            cy.updateCollectionGraph({
              [DATA_GROUP_ID]: {
                root: NONE,
                [collection.id]: READ,
              },
            });

            cy.signOut();
            mockAuthProviderAndJwtSignIn(USERS.nocollection);

            embedAllCollections();

            H.getSimpleEmbedIframeContent().within(() => {
              cy.log(
                "the virtual root lists what the user can reach, with no error",
              );
              cy.findByTestId("all-collections-list").within(() => {
                cy.findByText("Your personal collection").should("be.visible");
                cy.findByText("Accessible Collection").should("be.visible");
              });
              cy.findByText("Our analytics").should("not.exist");
              cy.findByText("You don't have access to this collection").should(
                "not.exist",
              );

              cy.log("drilling in shows the collection's contents");
              cy.findByText("Accessible Collection").click();
              // wait for the navigation out of the virtual root
              cy.findByTestId("all-collections-list").should("not.exist");
              cy.findByText("Accessible Dashboard").should("be.visible");

              cy.log("the trail has no unreachable root crumb");
              cy.findByTestId("sdk-breadcrumbs").within(() => {
                cy.findByText("All collections").should("be.visible");
                cy.findByText("Our analytics").should("not.exist");
              });

              cy.log("the `All collections` crumb returns to the virtual root");
              cy.findByTestId("sdk-breadcrumbs")
                .findByText("All collections")
                .click();
              cy.findByTestId("all-collections-list")
                .findByText("Your personal collection")
                .should("be.visible");
            });
          },
        );
      });
    });
  });

  it("should reset `New question` editor state when clicking 'New question' breadcrumb after selecting a filter", () => {
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
      cy.findByText("New question").click();

      cy.findByText("Pick your starting data").should("be.visible");

      cy.intercept("POST", "/api/dataset/query_metadata").as("datasetMetadata");
      cy.findByText("Orders").click();

      // Wait for the dataset metadata POST triggered by updateQuestionSdk
      // to complete before clicking the breadcrumb. Without this, the stale
      // updateQuestion dispatch can race with loadAndQueryQuestion and
      // overwrite the reset state.
      cy.wait("@datasetMetadata");
      cy.findByTestId("data-step-cell").should("have.text", "Orders");

      cy.findByTestId("sdk-breadcrumbs").findByText("New question").click();

      cy.findByText("Pick your starting data").should("be.visible");
      cy.findByTestId("data-step-cell").should("not.have.text", "Orders");
    });
  });

  it("should reset `New question` editor state when clicking 'New question' breadcrumb after Visualize", () => {
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
      cy.findByText("New question").click();

      cy.findByText("Pick your starting data").should("be.visible");

      cy.intercept("POST", "/api/dataset/query_metadata").as("datasetMetadata");
      cy.findByText("Orders").click();
      cy.wait("@datasetMetadata");
      cy.findByTestId("data-step-cell").should("have.text", "Orders");

      cy.button("Visualize").click();
      cy.findByTestId("visualization-root").should("be.visible");

      cy.findByTestId("sdk-breadcrumbs").findByText("New question").click();

      // Expected: editor reopens fresh, prior table cleared.
      cy.findByText("Pick your starting data").should("be.visible");
      cy.findByTestId("data-step-cell").should("not.have.text", "Orders");
    });
  });
});
