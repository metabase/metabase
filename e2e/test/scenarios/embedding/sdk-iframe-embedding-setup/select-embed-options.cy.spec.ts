import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > select embed options", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recents?*").as("recentActivity");
  });

  it("should be able to toggle drill-throughs", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar()
      .findByLabelText("Allow users to drill through on data points")
      .should("be.checked");

    cy.log("drill-through should be enabled in the preview");
    H.getIframeBody().within(() => {
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value").should("be.visible");
    });

    cy.log("turn off drill-through");
    getEmbedSidebar()
      .findByLabelText("Allow users to drill through on data points")
      .click()
      .should("not.be.checked");

    cy.log("drill-through should be disabled in the preview");
    H.getIframeBody().within(() => {
      cy.findByText("110.93").click();
      cy.findByText("Filter by this value").should("not.exist");
    });
  });

  it("should toggle downloads option for dashboard", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar()
      .findByLabelText("Allow downloads")
      .should("not.be.checked");

    H.getIframeBody().findByTestId("export-as-pdf-button").should("not.exist");

    cy.log("turn on downloads");
    getEmbedSidebar()
      .findByLabelText("Allow downloads")
      .click()
      .should("be.checked");

    H.getIframeBody().findByTestId("export-as-pdf-button").should("be.visible");
  });

  it("should toggle title option for dashboards", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar()
      .findByLabelText("Show dashboard title")
      .should("be.checked");

    H.getIframeBody().findByText("Orders in a dashboard").should("be.visible");

    cy.log("turn off title");
    getEmbedSidebar()
      .findByLabelText("Show dashboard title")
      .click()
      .should("not.be.checked");

    H.getIframeBody().findByText("Orders in a dashboard").should("not.exist");
  });

  it("should toggle drill-through option for chart", () => {
    navigateToEmbedOptionsStep({ experience: "chart" });

    getEmbedSidebar().within(() => {
      const drillThroughCheckbox = cy.findByLabelText(
        "Allow users to drill through on data points",
      );
      drillThroughCheckbox.should("not.be.checked");

      drillThroughCheckbox.click();
      drillThroughCheckbox.should("be.checked");
    });
  });

  it("should toggle downloads option for chart", () => {
    navigateToEmbedOptionsStep({ experience: "chart" });

    getEmbedSidebar().within(() => {
      const downloadsCheckbox = cy.findByLabelText("Allow downloads");
      downloadsCheckbox.should("not.be.checked");

      downloadsCheckbox.click();
      downloadsCheckbox.should("be.checked");
    });
  });

  it("should show title option when drill-through is enabled for chart", () => {
    navigateToEmbedOptionsStep({ experience: "chart" });

    getEmbedSidebar().within(() => {
      // Enable drill-through first to show title option
      cy.findByLabelText("Allow users to drill through on data points").click();
      cy.findByLabelText("Show chart title").should("be.visible");
    });
  });

  it("should toggle save option for exploration", () => {
    navigateToEmbedOptionsStep({ experience: "exploration" });

    getEmbedSidebar().within(() => {
      const saveCheckbox = cy.findByLabelText(
        "Allow users to save new questions",
      );
      saveCheckbox.should("not.be.checked");

      saveCheckbox.click();
      saveCheckbox.should("be.checked");
    });
  });

  it("should display theme color pickers", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByText("Brand Color").should("be.visible");
      cy.findByText("Text Color").should("be.visible");
      cy.findByText("Background Color").should("be.visible");
    });
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
