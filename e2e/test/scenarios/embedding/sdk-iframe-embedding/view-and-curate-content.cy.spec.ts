const { H } = cy;

const setupEmbed = (elementHtml: string) => {
  H.visitCustomHtmlPage(`
    ${H.getNewEmbedScriptTag()}
    ${H.getNewEmbedConfigurationScript({})}
    ${elementHtml}
  `);
};

describe(
  "scenarios > embedding > sdk iframe embedding > view and curate content",
  { tags: "@flaky" },
  () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.prepareSdkIframeEmbedTest({ withTokenFeatures: true });
    });

    describe("<metabase-browser> (read-only mode)", () => {
      it("should show a collection browser with collection items", () => {
        setupEmbed('<metabase-browser initial-collection="root" />');

        H.getSimpleEmbedIframeContent()
          .should("contain", "Name")
          .findAllByText("Orders")
          .first()
          .should("be.visible");
      });

      it("should navigate to question when clicking on a question item", () => {
        setupEmbed('<metabase-browser initial-collection="root" />');

        H.getSimpleEmbedIframeContent()
          .findByText("Orders")
          .should("be.visible")
          .click();

        cy.log("should show question view");
        H.getSimpleEmbedIframeContent()
          .findByTestId("query-visualization-root")
          .should("be.visible");
      });

      it("should show New Exploration button and open data picker when clicked", () => {
        setupEmbed('<metabase-browser initial-collection="root" />');

        H.getSimpleEmbedIframeContent()
          .findByText("New Exploration")
          .should("be.visible")
          .click();

        H.getSimpleEmbedIframeContent()
          .findByText("Pick your starting data")
          .should("be.visible");
      });

      it("should pass through collection-visible-columns parameter", () => {
        setupEmbed(`
        <metabase-browser
          initial-collection="root"
          collection-visible-columns='["type", "name"]'
        />
      `);

        H.getSimpleEmbedIframeContent().should("contain", "Name");
        H.getSimpleEmbedIframeContent().should("contain", "Type");
        H.getSimpleEmbedIframeContent().should("not.contain", "Last edited by");
        H.getSimpleEmbedIframeContent().should("not.contain", "Last edited at");
      });

      it("should pass through collection-page-size parameter", () => {
        setupEmbed(`
        <metabase-browser
          initial-collection="root"
          collection-page-size="5"
        />
      `);

        cy.log("should show exactly 5 collection entries");
        H.getSimpleEmbedIframeContent()
          .findAllByTestId("collection-entry-type")
          .should("have.length", 5);
      });

      it("should hide New Exploration button when with-new-question is false", () => {
        setupEmbed(`
        <metabase-browser
          initial-collection="root"
          with-new-question="false"
        />
      `);

        H.getSimpleEmbedIframeContent()
          .findByText("New Exploration")
          .should("not.exist");
      });
    });

    describe("<metabase-browser> (read-write mode)", () => {
      it("should show New Dashboard button and open modal when clicked", () => {
        setupEmbed(
          '<metabase-browser initial-collection="root" read-only="false" />',
        );

        H.getSimpleEmbedIframeContent()
          .findByText("New Dashboard")
          .should("be.visible")
          .click();

        cy.log("should show create dashboard modal");
        H.getSimpleEmbedIframeContent()
          .findByText("New dashboard")
          .should("be.visible");
      });

      it("should update breadcrumbs when creating dashboard in different collection", () => {
        setupEmbed(
          '<metabase-browser initial-collection="root" read-only="false" />',
        );

        cy.log("verify initial breadcrumb");
        H.getSimpleEmbedIframeContent()
          .findByText("Our analytics")
          .should("be.visible");

        H.getSimpleEmbedIframeContent().findByText("New Dashboard").click();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.log("change collection to save dashboard in");
          cy.findByRole("dialog").within(() => {
            cy.findByText("Which collection should this go in?").should(
              "be.visible",
            );

            cy.findByText("Our analytics").click();
          });

          cy.findByText("First collection", { timeout: 20_000 }).click();
          cy.findByText("Select").click();

          cy.log("create the dashboard");
          cy.findByRole("dialog").within(() => {
            cy.findByPlaceholderText(
              "What is the name of your dashboard?",
            ).type("Test Dashboard");
            cy.findByText("Create").click();
          });
        });

        cy.log(
          "verify breadcrumbs are updated to reflect the selected collection",
        );
        H.getSimpleEmbedIframeContent()
          .findByTestId("sdk-breadcrumbs")
          .findByText("First collection")
          .should("be.visible");
      });

      it("should show New Exploration button and open data picker when clicked", () => {
        setupEmbed(
          '<metabase-browser initial-collection="root" read-only="false" />',
        );

        H.getSimpleEmbedIframeContent()
          .findByText("New Exploration")
          .should("be.visible")
          .click();

        cy.log("should show data picker");
        H.getSimpleEmbedIframeContent()
          .findByText("Pick your starting data")
          .should("be.visible");
      });

      it("should show Save button and save modal without entity picker when creating a new question", () => {
        setupEmbed(
          '<metabase-browser initial-collection="root" read-only="false" />',
        );

        H.getSimpleEmbedIframeContent().findByText("New Exploration").click();

        cy.log("select data model");
        H.getSimpleEmbedIframeContent().findByText("Orders").click();

        cy.log("should show Save button");
        H.getSimpleEmbedIframeContent()
          .findByText("Save")
          .should("be.visible")
          .click();

        cy.log("should show save modal without entity picker");
        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByRole("dialog").within(() => {
            cy.findByText("Save new question").should("be.visible");
            cy.findByText("Where do you want to save this?").should(
              "not.exist",
            );
          });
        });
      });

      it("should hide New Dashboard button when with-new-dashboard is false", () => {
        setupEmbed(`
        <metabase-browser
          initial-collection="root"
          read-only="false"
          with-new-dashboard="false"
        />
      `);

        H.getSimpleEmbedIframeContent()
          .findByText("New Dashboard")
          .should("not.exist");
      });

      it("should create a dashboard in a new collection", () => {
        setupEmbed(
          '<metabase-browser initial-collection="root" read-only="false" />',
        );

        H.getSimpleEmbedIframeContent()
          .findByText("New Dashboard")
          .should("be.visible")
          .click();

        H.getSimpleEmbedIframeContent().within(() => {
          cy.findByRole("dialog").within(() => {
            cy.findByPlaceholderText(
              "What is the name of your dashboard?",
            ).type("Foo Bar Dashboard");

            cy.log("open the collection picker");
            cy.findByText("Our analytics").click();
          });

          cy.findByText("Collections").click();
          cy.findByText("New collection").click();

          cy.findAllByRole("dialog")
            .eq(2)
            .within(() => {
              cy.findByPlaceholderText("My new collection").type(
                "Foo Collection",
              );
              cy.findByText("Create").click();
            });

          cy.findByText("Select").click();

          cy.log("create new dashboard");
          cy.findByRole("dialog").within(() => {
            cy.findByText("Create").click();
          });
        });

        cy.log("dashboard is created and shows empty state");
        H.getSimpleEmbedIframeContent()
          .findByText("This dashboard is empty")
          .should("be.visible");

        cy.log("breadcrumbs show the new collection");
        H.getSimpleEmbedIframeContent()
          .findByTestId("sdk-breadcrumbs")
          .findByText("Foo Collection")
          .should("be.visible");

        cy.log("breadcrumbs show the new dashboard");
        H.getSimpleEmbedIframeContent()
          .findByTestId("sdk-breadcrumbs")
          .findByText("Foo Bar Dashboard")
          .should("be.visible");

        cy.log("dashboard title is visible in header");
        H.getSimpleEmbedIframeContent()
          .findByTestId("dashboard-header")
          .findByText("Foo Bar Dashboard")
          .should("be.visible");
      });

      it("should hide New Exploration button when with-new-question is false", () => {
        setupEmbed(`
        <metabase-browser
          initial-collection="root"
          read-only="false"
          with-new-question="false"
        />
      `);

        H.getSimpleEmbedIframeContent()
          .findByText("New Exploration")
          .should("not.exist");
      });

      it("should pass through data-picker-entity-types parameter", () => {
        setupEmbed(`
        <metabase-browser
          initial-collection="root"
          read-only="false"
          data-picker-entity-types='["table"]'
        />
      `);

        H.getSimpleEmbedIframeContent().findByText("New Exploration").click();

        cy.log("should show data picker with limited entity types");
        H.getSimpleEmbedIframeContent()
          .findByText("Pick your starting data")
          .should("be.visible");

        cy.log("should show Orders table but not Orders model");
        H.getSimpleEmbedIframeContent().should("contain", "Orders");
        H.getSimpleEmbedIframeContent().should("not.contain", "Orders model");
      });
    });

    describe("breadcrumb navigation", () => {
      it("should show breadcrumbs when navigating between content", () => {
        setupEmbed('<metabase-browser initial-collection="root" />');

        cy.log("should show initial breadcrumb");
        H.getSimpleEmbedIframeContent()
          .findByText("Our analytics")
          .should("be.visible");

        H.getSimpleEmbedIframeContent().findAllByText("Orders").first().click();

        cy.log("should show breadcrumb for the question");
        H.getSimpleEmbedIframeContent().should("contain", "Orders");

        H.getSimpleEmbedIframeContent().findByText("Our analytics").click();

        cy.log("should be back at collection browser");
        H.getSimpleEmbedIframeContent().should("contain", "Name");
      });
    });
  },
);
