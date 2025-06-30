import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/activity/recent_views").as("recentActivity");
  });

  it("persists dashboard embed options after page reload with debounced saving", () => {
    cy.log("1. Navigate to embed options step for dashboard");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("2. Verify initial default states");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
      cy.findByLabelText("Allow downloads").should("not.be.checked");
      cy.findByLabelText("Show dashboard title").should("be.checked");
    });

    cy.log("3. Configure embed options to non-default values");
    getEmbedSidebar().within(() => {
      cy.log("Turn on downloads (was off)");
      cy.findByLabelText("Allow downloads").click().should("be.checked");

      cy.log("Turn off dashboard title (was on)");
      cy.findByLabelText("Show dashboard title")
        .click()
        .should("not.be.checked");
    });

    cy.log("4. Verify options are applied in preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("export-as-pdf-button").should("be.visible");
      cy.findByText("Orders in a dashboard").should("not.exist");
    });

    cy.log("5. Wait for debounced saving to complete");
    cy.wait(3000);

    cy.log("6. Reload the page to test persistence");
    cy.reload();
    cy.wait("@dashboard");

    cy.log("7. Navigate back to embed options step");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("8. Verify persisted settings are restored (non-default values)");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show dashboard title").should("not.be.checked");
      cy.log("Drill-through should remain at default (checked)");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });

    cy.log("9. Verify options are still applied in preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("export-as-pdf-button").should("be.visible");
      cy.findByText("Orders in a dashboard").should("not.exist");
    });
  });

  it("persists chart embed options after page reload", () => {
    cy.log("1. Navigate to embed options step for chart");
    navigateToEmbedOptionsStep({ experience: "chart" });

    cy.log("2. Verify initial chart default states");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
      cy.findByLabelText("Allow downloads").should("not.be.checked");
      cy.findByLabelText("Show chart title").should("be.checked");
    });

    cy.log("3. Configure chart embed options to non-default values");
    getEmbedSidebar().within(() => {
      cy.log("Turn on downloads (was off)");
      cy.findByLabelText("Allow downloads").click().should("be.checked");

      cy.log("Turn off chart title (was on)");
      cy.findByLabelText("Show chart title").click().should("not.be.checked");
    });

    cy.log("4. Verify options are applied in preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("question-download-widget-button").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });

    cy.log("5. Wait for debounced saving");
    cy.wait(3000);

    cy.log("6. Reload and navigate back to options");
    cy.reload();
    cy.wait("@dashboard");
    navigateToEmbedOptionsStep({ experience: "chart" });

    cy.log("7. Verify chart settings are restored (non-default values)");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show chart title").should("not.be.checked");
      cy.log("Drill-through should remain at default (checked)");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });

    cy.log("8. Verify chart options persist in preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("question-download-widget-button").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });
  });

  it("persists exploration embed options after page reload", () => {
    cy.log("1. Navigate to embed options step for exploration");
    navigateToEmbedOptionsStep({ experience: "exploration" });

    cy.log("2. Configure exploration options");
    H.getIframeBody().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
    });

    getEmbedSidebar().within(() => {
      cy.log("Turn off save option");
      cy.findByLabelText("Allow users to save new questions")
        .should("be.checked")
        .click()
        .should("not.be.checked");
    });

    cy.log("3. Verify save button is hidden");
    H.getIframeBody().findByText("Save").should("not.exist");

    cy.log("4. Wait for debounced saving");
    cy.wait(2000);

    cy.log("5. Reload and navigate back to exploration options");
    cy.reload();
    cy.wait("@dashboard");
    navigateToEmbedOptionsStep({ experience: "exploration" });

    cy.log("6. Navigate to data and visualize again");
    H.getIframeBody().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
    });

    cy.log("7. Verify save option persistence");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions").should(
        "not.be.checked",
      );
    });

    cy.log("8. Verify save button is still hidden");
    H.getIframeBody().findByText("Save").should("not.exist");
  });

  it("persists brand color customization across page reloads", () => {
    cy.log("1. Navigate to embed options for dashboard");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("2. Change brand color to red");
    cy.findByLabelText("#509EE3").click();

    H.popover().within(() => {
      cy.findByDisplayValue("#509EE3")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)");
    });

    cy.log("3. Verify brand color is applied");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("4. Wait for debounced saving");
    cy.wait(2000);

    cy.log("5. Reload and navigate back to options");
    cy.reload();
    cy.wait("@dashboard");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("6. Verify brand color persistence");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");
  });

  it("persists settings across different embed experiences", () => {
    cy.log("1. Configure dashboard options");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").click().should("be.checked");
    });

    cy.log("2. Wait for persistence");
    cy.wait(2000);

    cy.log("3. Switch to chart experience");
    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();
    });

    cy.log("4. Navigate to chart options");
    navigateToEmbedOptionsStep({ experience: "chart" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Show chart title").click().should("not.be.checked");
    });

    cy.log("5. Wait and reload");
    cy.wait(2000);
    cy.reload();
    cy.wait("@dashboard");

    cy.log("6. Verify dashboard settings persist");
    navigateToEmbedOptionsStep({ experience: "dashboard" });
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
    });

    cy.log("7. Verify chart settings persist");
    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();
    });
    navigateToEmbedOptionsStep({ experience: "chart" });
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Show chart title").should("not.be.checked");
    });
  });

  it("handles debounced saving correctly during rapid configuration changes", () => {
    cy.log("1. Navigate to embed options");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("2. Make rapid configuration changes");
    getEmbedSidebar().within(() => {
      cy.log("Toggle multiple options quickly");
      cy.findByLabelText("Allow downloads").click();
      cy.findByLabelText("Show dashboard title").click();
      cy.findByLabelText("Allow users to drill through on data points").click();

      cy.log("Toggle them back");
      cy.findByLabelText("Allow downloads").click();
      cy.findByLabelText("Show dashboard title").click();
    });

    cy.log("3. Wait for debounced saving to settle");
    cy.wait(3000);

    cy.log("4. Reload and verify final state");
    cy.reload();
    cy.wait("@dashboard");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("not.be.checked");
      cy.findByLabelText("Show dashboard title").should("be.checked");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "not.be.checked",
      );
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
