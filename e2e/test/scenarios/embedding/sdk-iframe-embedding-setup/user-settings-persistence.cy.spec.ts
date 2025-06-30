import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("persists dashboard embed options", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. set embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads")
        .should("not.be.checked")
        .click()
        .should("be.checked");

      capturePersistSettings();

      cy.findByLabelText("Show dashboard title")
        .should("be.checked")
        .click()
        .should("not.be.checked");
    });

    H.getIframeBody().within(() => {
      cy.findByTestId("export-as-pdf-button").should("be.visible");
      cy.findByText("Orders in a dashboard").should("not.exist");
    });

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Dashboard").should("be.checked");
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("3. persisted settings should be restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show dashboard title").should("not.be.checked");
      cy.log("Drill-through should remain at default (checked)");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });

    H.getIframeBody().within(() => {
      cy.findByTestId("export-as-pdf-button").should("be.visible");
      cy.findByText("Orders in a dashboard").should("not.exist");
    });
  });

  it("persists chart embed options", () => {
    navigateToEmbedOptionsStep({ experience: "chart" });

    cy.log("1. set chart embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").click().should("be.checked");

      capturePersistSettings();
      cy.findByLabelText("Show chart title").click().should("not.be.checked");
    });

    cy.log("2. options should be applied in preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("question-download-widget-button").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });

    cy.log("3. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Chart").should("be.checked");
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("4. verify persisted settings are restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show chart title").should("not.be.checked");
      cy.log("Drill-through should remain at default (checked)");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });

    cy.log("5. options should be applied to preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("question-download-widget-button").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });
  });

  it("persists exploration embed options", () => {
    navigateToEmbedOptionsStep({ experience: "exploration" });
    capturePersistSettings();

    H.getIframeBody().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
      cy.findByText("Save").should("be.visible");
    });

    cy.log("1. set exploration settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions")
        .should("be.checked")
        .click()
        .should("not.be.checked");
    });

    H.getIframeBody().findByText("Save").should("not.exist");

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Exploration").should("be.checked");
      cy.findByText("Next").click(); // Embed options step
    });

    H.getIframeBody().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
    });

    cy.log("3. persisted settings should be restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions").should(
        "not.be.checked",
      );
    });

    H.getIframeBody().findByText("Save").should("not.exist");
  });

  it("persists brand color customization across page reloads", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });
    capturePersistSettings();

    cy.log("1. change brand color to red");
    cy.findByLabelText("#509EE3").click();

    H.popover().within(() => {
      cy.findByDisplayValue("#509EE3")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)");
    });

    cy.log("2. verify brand color is applied");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("3. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("4. verify brand color persistence");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");
  });
});

const navigateToEmbedOptionsStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  navigateToEntitySelectionStep({ experience });

  getEmbedSidebar().within(() => {
    cy.findByText("Next").click(); // Embed options step
  });
};

// We must capture at the last embed options to change,
// otherwise we'd miss the last PUT request.
const capturePersistSettings = () => {
  cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings").as(
    "persistSettings",
  );
};

const waitAndReload = () => {
  cy.wait("@persistSettings");
  cy.reload();
};
