const { H } = cy;

const setupEmbed = (elementHtml: string) => {
  H.visitCustomHtmlPage(`
    ${H.getNewEmbedScriptTag()}
    ${H.getNewEmbedConfigurationScript({})}
    ${elementHtml}
  `);
};

describe("scenarios > embedding > sdk iframe embedding > view and curate content", () => {
  beforeEach(() => {
    cy.signInAsAdmin();
    H.prepareSdkIframeEmbedTest({ withTokenFeatures: true });
  });

  describe("<metabase-view-content>", () => {
    it("should show a collection browser with collection items", () => {
      setupEmbed('<metabase-view-content initial-collection="root" />');

      H.getSimpleEmbedIframeContent()
        .should("contain", "Name")
        .findAllByText("Orders")
        .first()
        .should("be.visible");
    });

    it("should navigate to question when clicking on a question item", () => {
      setupEmbed('<metabase-view-content initial-collection="root" />');

      H.getSimpleEmbedIframeContent()
        .findByText("Orders")
        .should("be.visible")
        .click();

      cy.log("Should show question view");
      H.getSimpleEmbedIframeContent()
        .findByTestId("query-visualization-root")
        .should("be.visible");
    });

    it("should show New Exploration button and open data picker when clicked", () => {
      setupEmbed('<metabase-view-content initial-collection="root" />');

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
        <metabase-view-content
          initial-collection="root"
          collection-visible-columns='["type", "name"]'
        />
      `);

      H.getSimpleEmbedIframeContent().should("contain", "Name");
      H.getSimpleEmbedIframeContent().should("contain", "Type");
      H.getSimpleEmbedIframeContent().should("not.contain", "Last edited by");
    });

    it("should pass through collection-page-size parameter", () => {
      setupEmbed(`
        <metabase-view-content
          initial-collection="root"
          collection-page-size="10"
        />
      `);

      cy.log("Should show collection browser");
      H.getSimpleEmbedIframeContent().should("contain", "Name");
    });

    it("should hide New Exploration button when with-new-question is false", () => {
      setupEmbed(`
        <metabase-view-content
          initial-collection="root"
          with-new-question="false"
        />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("New Exploration")
        .should("not.exist");
    });
  });

  describe("<metabase-curate-content>", () => {
    it("should show New Dashboard button and open modal when clicked", () => {
      setupEmbed('<metabase-curate-content initial-collection="root" />');

      H.getSimpleEmbedIframeContent()
        .findByText("New Dashboard")
        .should("be.visible")
        .click();

      cy.log("Should show create dashboard modal");
      H.getSimpleEmbedIframeContent()
        .findByText("New dashboard")
        .should("be.visible");
    });

    it("should show New Exploration button and open data picker when clicked", () => {
      setupEmbed('<metabase-curate-content initial-collection="root" />');

      H.getSimpleEmbedIframeContent()
        .findByText("New Exploration")
        .should("be.visible")
        .click();

      cy.log("Should show data picker");
      H.getSimpleEmbedIframeContent()
        .findByText("Pick your starting data")
        .should("be.visible");
    });

    it("should show Save button and save modal without entity picker when creating a new question", () => {
      setupEmbed('<metabase-curate-content initial-collection="root" />');

      H.getSimpleEmbedIframeContent().findByText("New Exploration").click();

      cy.log("Select data model");
      H.getSimpleEmbedIframeContent().findByText("Orders").click();

      cy.log("Should show Save button");
      H.getSimpleEmbedIframeContent()
        .findByText("Save")
        .should("be.visible")
        .click();

      cy.log("Should show save modal without entity picker");
      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByRole("dialog").within(() => {
          cy.findByText("Save new question").should("be.visible");
          cy.findByText("Where do you want to save this?").should("not.exist");
        });
      });
    });

    it("should hide New Dashboard button when with-new-dashboard is false", () => {
      setupEmbed(`
        <metabase-curate-content
          initial-collection="root"
          with-new-dashboard="false"
        />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("New Dashboard")
        .should("not.exist");
    });

    it("should hide New Exploration button when with-new-question is false", () => {
      setupEmbed(`
        <metabase-curate-content
          initial-collection="root"
          with-new-question="false"
        />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("New Exploration")
        .should("not.exist");
    });

    it("should pass through data-picker-entity-types parameter", () => {
      setupEmbed(`
        <metabase-curate-content
          initial-collection="root"
          data-picker-entity-types='["table"]'
        />
      `);

      H.getSimpleEmbedIframeContent().findByText("New Exploration").click();

      cy.log("Should show data picker with limited entity types");
      H.getSimpleEmbedIframeContent()
        .findByText("Pick your starting data")
        .should("be.visible");

      cy.log("Should show Orders table but not Orders model");
      H.getSimpleEmbedIframeContent().should("contain", "Orders");
      H.getSimpleEmbedIframeContent().should("not.contain", "Orders model");
    });
  });

  describe("breadcrumb navigation", () => {
    it("should show breadcrumbs when navigating between content", () => {
      setupEmbed('<metabase-view-content initial-collection="root" />');

      cy.log("Should show initial breadcrumb");
      H.getSimpleEmbedIframeContent()
        .findByText("Our analytics")
        .should("be.visible");

      H.getSimpleEmbedIframeContent().findAllByText("Orders").first().click();

      cy.log("Should show breadcrumb for the question");
      H.getSimpleEmbedIframeContent().should("contain", "Orders");

      H.getSimpleEmbedIframeContent().findByText("Our analytics").click();

      cy.log("Should be back at collection browser");
      H.getSimpleEmbedIframeContent().should("contain", "Name");
    });
  });
});
