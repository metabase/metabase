import { restore } from "__support__/e2e/cypress";

describe("scenarios > home > homepage", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/activity/recent_views").as("getRecentItems");
    cy.intercept("GET", "/api/activity/popular_items").as("getPopularItems");
    cy.intercept("GET", "/api/automagic-*/database/**").as("getCandidates");
    cy.intercept("GET", "/api/automagic-*/table/**").as("getDashboard");
  });

  it("should display x-rays for the sample database", () => {
    restore("setup");
    cy.signInAsAdmin();

    cy.visit("/");
    cy.wait("@getCandidates");
    cy.findByText("Try out these sample x-rays to see what Metabase can do.");
    cy.findByText("Orders").click();

    cy.wait("@getDashboard");
    cy.findByText("More X-rays");
  });

  it("should display x-rays for a user database", () => {
    restore("setup");
    cy.signInAsAdmin();
    cy.addH2SampleDatabase({ name: "H2" });

    cy.visit("/");
    cy.wait("@getCandidates");
    cy.findByText("Here are some explorations of");
    cy.findByText("H2");
    cy.findByText("Orders").click();

    cy.wait("@getDashboard");
    cy.findByText("More X-rays");
  });

  it("should allow to switch between multiple schemas for x-rays", () => {
    restore("setup");
    cy.signInAsAdmin();
    cy.addH2SampleDatabase({ name: "H2" });
    cy.intercept("/api/automagic-*/database/**", getCandidates());

    cy.visit("/");
    cy.findByText(/Here are some explorations of the/);
    cy.findByText("public");
    cy.findByText("H2");
    cy.findByText("Orders");
    cy.findByText("People").should("not.exist");

    cy.findByText("public").click();
    cy.findByText("private").click();
    cy.findByText("People");
    cy.findByText("Orders").should("not.exist");
  });

  it("should display recent items", () => {
    restore("default");
    cy.signInAsAdmin();

    cy.visit("/dashboard/1");
    cy.findByText("Orders in a dashboard");

    cy.visit("/");
    cy.wait("@getRecentItems");
    cy.findByText("Pick up where you left off");
    cy.findByText("Orders, Count").should("not.exist");
    cy.findByText("Orders in a dashboard").click();
    cy.findByText("Orders, Count");
  });

  it("should display popular items for a new user", () => {
    restore("default");
    cy.signInAsNormalUser();

    cy.visit("/");
    cy.wait("@getPopularItems");
    cy.findByText("Here are some popular items");
    cy.findByText("Orders in a dashboard").click();
    cy.findByText("Orders, Count");
  });
});

const getCandidates = () => [
  {
    id: "1/public",
    schema: "public",
    tables: [{ title: "Orders", url: "/auto/dashboard/table/1" }],
  },
  {
    id: "1/private",
    schema: "private",
    tables: [{ title: "People", url: "/auto/dashboard/table/2" }],
  },
];
