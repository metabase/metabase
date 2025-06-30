import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings").as(
      "persistSettings",
    );
  });

  it("persists dashboard embed options after page reload with debounced saving", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. set embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.log("Turn on downloads (was off)");
      cy.findByLabelText("Allow downloads").click().should("be.checked");

      cy.log("Turn off dashboard title (was on)");
      cy.findByLabelText("Show dashboard title")
        .click()
        .should("not.be.checked");
    });

    cy.log("2. options should be applied in preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("export-as-pdf-button").should("be.visible");
      cy.findByText("Orders in a dashboard").should("not.exist");
    });

    cy.log("3. reload the page");
    cy.wait("@persistSettings");
    cy.reload();
    cy.wait("@dashboard");

    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("4. verify persisted settings are restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show dashboard title").should("not.be.checked");
      cy.log("Drill-through should remain at default (checked)");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });

    cy.log("5. options should be applied to preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("export-as-pdf-button").should("be.visible");
      cy.findByText("Orders in a dashboard").should("not.exist");
    });
  });

  it("persists chart embed options after page reload", () => {
    navigateToEmbedOptionsStep({ experience: "chart" });

    cy.log("1. set chart embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.log("Turn on downloads (was off)");
      cy.findByLabelText("Allow downloads").click().should("be.checked");

      cy.log("Turn off chart title (was on)");
      cy.findByLabelText("Show chart title").click().should("not.be.checked");
    });

    cy.log("2. options should be applied in preview");
    H.getIframeBody().within(() => {
      cy.findByTestId("question-download-widget-button").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });

    cy.log("3. reload the page");
    cy.wait("@persistSettings");
    cy.reload();
    cy.wait("@dashboard");
    navigateToEmbedOptionsStep({ experience: "chart" });

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

  it("persists exploration embed options after page reload", () => {
    navigateToEmbedOptionsStep({ experience: "exploration" });

    H.getIframeBody().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
    });

    cy.log("1. set exploration settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions")
        .should("be.checked")
        .click()
        .should("not.be.checked");
    });

    cy.log("2. options should be applied in preview");
    H.getIframeBody().findByText("Save").should("not.exist");

    cy.log("3. reload the page");
    cy.wait("@persistSettings");
    cy.reload();
    cy.wait("@dashboard");

    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("4. navigate to data and visualize again");
    H.getIframeBody().within(() => {
      cy.findByText("Orders").click();
      cy.findByText("Visualize").click();
    });

    cy.log("5. verify persisted settings are restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions").should(
        "not.be.checked",
      );
    });

    cy.log("6. options should be applied to preview");
    H.getIframeBody().findByText("Save").should("not.exist");
  });

  it("persists brand color customization across page reloads", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

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
    cy.wait("@persistSettings");
    cy.reload();
    cy.wait("@dashboard");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("4. verify brand color persistence");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");
  });

  it("persists settings across different embed experiences", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. configure dashboard options");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").click().should("be.checked");
    });

    cy.log("2. switch to chart experience and configure");
    cy.wait("@persistSettings");
    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();
    });

    navigateToEmbedOptionsStep({ experience: "chart" });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Show chart title").click().should("not.be.checked");
    });

    cy.log("3. reload the page");
    cy.wait("@persistSettings");
    cy.reload();
    cy.wait("@dashboard");

    cy.log("4. verify dashboard settings persist");
    navigateToEmbedOptionsStep({ experience: "dashboard" });
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
    });

    cy.log("5. verify chart settings persist");
    getEmbedSidebar().within(() => {
      cy.findByText("Chart").click();
    });
    navigateToEmbedOptionsStep({ experience: "chart" });
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Show chart title").should("not.be.checked");
    });
  });

  it("handles debounced saving correctly during rapid configuration changes", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. make rapid configuration changes");
    getEmbedSidebar().within(() => {
      cy.log("Toggle multiple options quickly");
      cy.findByLabelText("Allow downloads").click();
      cy.findByLabelText("Show dashboard title").click();
      cy.findByLabelText("Allow users to drill through on data points").click();

      cy.log("Toggle them back");
      cy.findByLabelText("Allow downloads").click();
      cy.findByLabelText("Show dashboard title").click();
    });

    cy.log("2. wait for debounced saving to settle");
    cy.wait("@persistSettings");

    cy.log("3. reload the page");
    cy.reload();
    cy.wait("@dashboard");
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("4. verify final state");
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
