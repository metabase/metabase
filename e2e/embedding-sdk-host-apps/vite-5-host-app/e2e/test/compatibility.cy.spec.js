const TIMEOUT_MS = 40000;

describe("Embedding SDK: vite-5-host-app compatibility", () => {
  it("should download an Interactive Dashboard", () => {
    cy.visit({
      url: "/interactive-dashboard",
    });

    cy.findByTestId("embed-frame", { timeout: TIMEOUT_MS }).within(() => {
      cy.findByTestId("fixed-width-dashboard-header", {
        timeout: TIMEOUT_MS,
      }).within(() => {
        cy.get("button svg.Icon-download").first().click({ force: true });
      });

      cy.readFile("cypress/downloads/E-commerce Insights.pdf", {
        timeout: TIMEOUT_MS,
      }).should("exist");
    });
  });

  it("should load a metabase locale", () => {
    cy.visit({
      url: "/interactive-question?locale=es&questionId=1",
    });

    cy.findByTestId("interactive-question-result-toolbar", {
      timeout: TIMEOUT_MS,
    }).within(() => {
      expect(cy.findByText("Tabla").should("exist"));
    });
  });

  it("should load a moment locale", () => {
    const time = new Date("2025-01-01");
    cy.clock(time, ["Date"]);

    cy.visit({
      url: "/interactive-question?locale=es&questionId=1",
    });

    cy.findByTestId("interactive-question-result-toolbar", {
      timeout: TIMEOUT_MS,
    }).within(() => {
      cy.findByText("Filtro").click();
    });

    cy.get('[data-element-id="mantine-popover"]').within(() => {
      cy.findByText("Created At").click();
      cy.findByText(/Rango de fechas relativo…/).click();
    });

    cy.findByTestId("date-filter-picker").within(() => {
      cy.findByText(/^dic\..*2024/).should("exist");
    });
  });

  it("should load a dayjs locale", () => {
    const time = new Date("2025-01-01");
    cy.clock(time, ["Date"]);

    cy.visit({
      url: "/interactive-question?locale=es&questionId=1",
    });

    cy.findByTestId("interactive-question-result-toolbar", {
      timeout: TIMEOUT_MS,
    }).within(() => {
      cy.findByText("Filtro").click();
    });
    cy.get('[data-element-id="mantine-popover"]').within(() => {
      cy.findByText("Created At").click();
      cy.findByText(/Rango de fechas fijo…/).click();
    });

    cy.findByTestId("date-filter-picker").within(() => {
      cy.findByText("enero 2025").should("exist");
    });
  });
});
