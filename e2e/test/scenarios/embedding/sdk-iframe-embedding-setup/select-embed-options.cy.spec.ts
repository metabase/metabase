import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";

import { getEmbedSidebar, visitNewEmbedPage } from "./helpers";

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

  it("should display behavior and appearance sections", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByText("Behavior").should("be.visible");
      cy.findByText("Appearance").should("be.visible");
    });
  });

  it("should toggle drill-through option for dashboard", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      const drillThroughCheckbox = cy.findByLabelText(
        "Allow users to drill through on data points",
      );
      drillThroughCheckbox.should("not.be.checked");

      drillThroughCheckbox.click();
      drillThroughCheckbox.should("be.checked");
    });
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

  it("should navigate back to entity selection step", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByRole("button", { name: "Back" }).click();
      cy.findByText("Select a dashboard to embed").should("be.visible");
    });
  });

  it("should navigate forward to get code step", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByRole("button", { name: "Get Code" }).click();
      cy.findByText("Choose the authentication method for embedding:").should(
        "be.visible",
      );
    });
  });

  it("should skip entity selection for exploration experience", () => {
    visitNewEmbedPage();

    getEmbedSidebar().within(() => {
      cy.findByText("Exploration").click();
      cy.findByRole("button", { name: "Next" }).click();

      // Should go directly to embed options, not entity selection
      cy.findByText("Behavior").should("be.visible");
      cy.findByText("Appearance").should("be.visible");
    });
  });
});

const navigateToEmbedOptionsStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  cy.log("visit a resource to populate the activity log");

  if (experience === "dashboard") {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    cy.wait("@dashboard");
  } else if (experience === "chart") {
    H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
    cy.wait("@cardQuery");
  }

  visitNewEmbedPage();

  cy.log("select an experience");

  if (experience === "chart") {
    cy.findByText("Chart").click();
  } else if (experience === "exploration") {
    cy.findByText("Exploration").click();
  }

  cy.log("navigate to the embed options step");

  getEmbedSidebar().within(() => {
    if (experience !== "exploration") {
      cy.findByText("Next").click(); // Entity selection step
    }

    cy.findByText("Next").click(); // Embed options step
  });
};
