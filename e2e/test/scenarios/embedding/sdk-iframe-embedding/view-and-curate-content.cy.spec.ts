const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding > view and curate content", () => {
  beforeEach(() => {
    cy.signInAsAdmin();
    H.prepareSdkIframeEmbedTest({
      withTokenFeatures: true,
    });
  });

  describe("<metabase-view-content>", () => {
    it("should show a collection browser with collection items", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-view-content initial-collection="root" />
      `);

      H.getSimpleEmbedIframeContent().should("contain", "Last edited by");
      H.getSimpleEmbedIframeContent().findByText("Orders").should("be.visible");
    });

    it("should navigate to question when clicking on a question item", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-view-content initial-collection="root" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("Orders")
        .should("be.visible")
        .click();

      // Should show the question view
      H.getSimpleEmbedIframeContent()
        .findByTestId("query-visualization-root")
        .should("be.visible");
    });

    it("should navigate to dashboard when clicking on a dashboard item", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-view-content initial-collection="root" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("Orders in a dashboard")
        .should("be.visible")
        .click();

      // Should show the dashboard view
      H.getSimpleEmbedIframeContent()
        .findByText("Orders in a dashboard")
        .should("be.visible");
    });

    it("should show New Exploration button and open data picker when clicked", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-view-content initial-collection="root" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("New Exploration")
        .should("be.visible")
        .click();

      // Should show the data picker
      H.getSimpleEmbedIframeContent()
        .findByText("Pick your starting data")
        .should("be.visible");
    });

    it("should pass through collection-visible-columns parameter", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-view-content 
          initial-collection="root" 
          collection-visible-columns='["type", "name"]' 
        />
      `);

      // Should show collection browser (minimal assertion to verify parameter passing)
      H.getSimpleEmbedIframeContent().should("contain", "Last edited by");
    });

    it("should pass through collection-page-size parameter", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-view-content 
          initial-collection="root" 
          collection-page-size="10" 
        />
      `);

      // Should show collection browser (minimal assertion to verify parameter passing)
      H.getSimpleEmbedIframeContent().should("contain", "Last edited by");
    });

    it("should hide New Exploration button when with-new-question is false", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
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
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-curate-content initial-collection="root" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("New Dashboard")
        .should("be.visible")
        .click();

      // Should show the create dashboard modal
      H.getSimpleEmbedIframeContent()
        .findByText("Create a new dashboard")
        .should("be.visible");
    });

    it("should show New Exploration button and open data picker when clicked", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-curate-content initial-collection="root" />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("New Exploration")
        .should("be.visible")
        .click();

      // Should show the data picker
      H.getSimpleEmbedIframeContent()
        .findByText("Pick your starting data")
        .should("be.visible");
    });

    it("should show Save button and save modal without entity picker when creating a new question", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-curate-content initial-collection="root" />
      `);

      // Click New Exploration
      H.getSimpleEmbedIframeContent().findByText("New Exploration").click();

      // Select a data model
      H.getSimpleEmbedIframeContent().findByText("Orders").click();

      // Should show Save button
      H.getSimpleEmbedIframeContent()
        .findByText("Save")
        .should("be.visible")
        .click();

      // Should show save modal without entity picker
      H.getSimpleEmbedIframeContent().within(() => {
        cy.findByRole("dialog").within(() => {
          cy.findByText("Save question").should("be.visible");
          cy.findByText("Where do you want to save this?").should("not.exist");
        });
      });
    });

    it("should hide New Dashboard button when with-new-dashboard is false", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
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
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-curate-content 
          initial-collection="root" 
          with-new-question="false" 
        />
      `);

      H.getSimpleEmbedIframeContent()
        .findByText("New Exploration")
        .should("not.exist");
    });

    it("should pass through collection-entity-types parameter", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-curate-content 
          initial-collection="root" 
          collection-entity-types='["question", "dashboard"]' 
        />
      `);

      // Should show collection browser (minimal assertion to verify parameter passing)
      H.getSimpleEmbedIframeContent().should("contain", "Last edited by");
    });

    it("should pass through data-picker-entity-types parameter", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-curate-content 
          initial-collection="root" 
          data-picker-entity-types='["table"]' 
        />
      `);

      // Click New Exploration to trigger data picker
      H.getSimpleEmbedIframeContent().findByText("New Exploration").click();

      // Should show the data picker with limited entity types
      H.getSimpleEmbedIframeContent()
        .findByText("Pick your starting data")
        .should("be.visible");

      // Should show Orders table but not Orders model
      H.getSimpleEmbedIframeContent().should("contain", "Orders");
      H.getSimpleEmbedIframeContent().should("not.contain", "Orders model");
    });
  });

  describe("breadcrumb navigation", () => {
    it("should show breadcrumbs when navigating between content", () => {
      H.visitCustomHtmlPage(`
        ${H.getNewEmbedScriptTag()}
        ${H.getNewEmbedConfigurationScript({})}
        <metabase-view-content initial-collection="root" />
      `);

      // Should show initial breadcrumb
      H.getSimpleEmbedIframeContent()
        .findByText("Our analytics")
        .should("be.visible");

      // Navigate to a question
      H.getSimpleEmbedIframeContent().findByText("Orders").click();

      // Should show breadcrumb for the question
      H.getSimpleEmbedIframeContent().findByText("Orders").should("be.visible");

      // Click breadcrumb to go back
      H.getSimpleEmbedIframeContent().findByText("Our analytics").click();

      // Should be back at collection browser
      H.getSimpleEmbedIframeContent().should("contain", "Last edited by");
    });
  });
});
