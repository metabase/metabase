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

  it("should toggle drill-through option and reflect in preview", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("drill-through should be enabled by default");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });

    cy.log("drill-through should be enabled in the preview iframe");
    H.getIframeBody().within(() => {
      cy.findByText("110.93").click();

      H.popover().within(() => {
        cy.findByText("Filter by this value").should("be.visible");
      });
    });

    // getEmbedSidebar().within(() => {
    //   const drillThroughCheckbox = cy.findByLabelText(
    //     "Allow users to drill through on data points",
    //   );

    //   // Toggle drill-through off
    //   drillThroughCheckbox.click();
    //   drillThroughCheckbox.should("not.be.checked");
    // });

    // cy.log("verify drill-through is disabled in the preview iframe");
    // H.getIframeBody().within(() => {
    //   // When drill-through is disabled, data cells should not have interactive behavior
    //   // This is harder to test directly, but we can at least verify the iframe is still working
    //   cy.findByText("Orders in a dashboard").should("be.visible");
    // });
  });

  it("should toggle downloads option for dashboard", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      const downloadsCheckbox = cy.findByLabelText("Allow downloads");
      downloadsCheckbox.should("not.be.checked");

      downloadsCheckbox.click();
      downloadsCheckbox.should("be.checked");
    });
  });

  it("should show title option for dashboard", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Show dashboard title").should("be.visible");
    });
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
