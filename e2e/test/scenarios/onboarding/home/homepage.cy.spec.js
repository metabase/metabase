import { popover, restore, visitDashboard } from "e2e/support/helpers";

describe("scenarios > home > homepage", () => {
  beforeEach(() => {
    cy.intercept("GET", `/api/dashboard/**`).as("getDashboard");
    cy.intercept("GET", "/api/automagic-*/table/**").as("getXrayDashboard");
    cy.intercept("GET", "/api/automagic-*/database/**").as("getXrayCandidates");
    cy.intercept("GET", "/api/activity/recent_views").as("getRecentItems");
    cy.intercept("GET", "/api/activity/popular_items").as("getPopularItems");
    cy.intercept("GET", "/api/collection/*/items*").as("getCollectionItems");
    cy.intercept("POST", `/api/card/*/query`).as("getQuestionQuery");
  });

  describe("after setup", () => {
    beforeEach(() => {
      restore("setup");
    });

    it("should display x-rays for the sample database", () => {
      cy.signInAsAdmin();

      cy.visit("/");
      cy.wait("@getXrayCandidates");
      cy.findByText("Try out these sample x-rays to see what Metabase can do.");
      cy.findByText("Orders").click();

      cy.wait("@getXrayDashboard");
      cy.findByText("More X-rays");
    });

    it("should display x-rays for a user database", () => {
      cy.signInAsAdmin();
      cy.addH2SampleDatabase({ name: "H2" });

      cy.visit("/");
      cy.wait("@getXrayCandidates");
      cy.findByText("Here are some explorations of");
      cy.findAllByRole("link").contains("H2");
      cy.findByText("Orders").click();

      cy.wait("@getXrayDashboard");
      cy.findByText("More X-rays");
    });

    it("should allow switching between multiple schemas for x-rays", () => {
      cy.signInAsAdmin();
      cy.addH2SampleDatabase({ name: "H2" });
      cy.intercept("/api/automagic-*/database/**", getXrayCandidates());

      cy.visit("/");
      cy.findByText(/Here are some explorations of the/);
      cy.findByText("public");
      cy.findAllByRole("link").contains("H2");
      cy.findByText("Orders");
      cy.findByText("People").should("not.exist");

      cy.findByText("public").click();
      cy.findByText("private").click();
      cy.findByText("People");
      cy.findByText("Orders").should("not.exist");
    });
  });

  describe("after content creation", () => {
    beforeEach(() => {
      restore("default");
    });

    it("should display recent items", () => {
      cy.signInAsAdmin();

      visitDashboard(1);
      cy.findByText("Orders in a dashboard");

      cy.visit("/");
      cy.wait("@getRecentItems");
      cy.findByText("Pick up where you left off");

      cy.findByText("Orders in a dashboard").click();
      cy.wait("@getDashboard");
      cy.findByText("Orders");
    });

    it("should display popular items for a new user", () => {
      cy.signInAsAdmin();
      visitDashboard(1);
      cy.findByText("Orders in a dashboard");
      cy.signOut();

      cy.signInAsNormalUser();
      cy.visit("/");
      cy.wait("@getPopularItems");
      cy.findByText("Here are some popular dashboards");
      cy.findByText("Orders in a dashboard").click();
      cy.wait("@getDashboard");
      cy.findByText("Orders");
    });

    it("should not show pinned questions in recent items when viewed in a collection", () => {
      cy.signInAsAdmin();

      visitDashboard(1);
      cy.findByText("Orders in a dashboard");

      cy.visit("/collection/root");
      cy.wait("@getCollectionItems");
      pinItem("Orders, Count");
      cy.wait("@getCollectionItems");
      cy.wait("@getQuestionQuery");

      cy.visit("/");
      cy.wait("@getRecentItems");
      cy.findByText("Orders in a dashboard").should("be.visible");
      cy.findByText("Orders, Count").should("not.exist");
    });
  });
});

const pinItem = name => {
  cy.findByText(name).closest("tr").icon("ellipsis").click();

  popover().icon("pin").click();
};

const getXrayCandidates = () => [
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
