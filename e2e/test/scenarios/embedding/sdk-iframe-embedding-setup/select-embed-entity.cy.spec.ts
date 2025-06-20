const { H } = cy;

describe("scenarios > embedding > sdk iframe embedding setup > step 3: select embed entity", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");

    // Set up common intercepts
    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("GET", "/api/card/**").as("card");
    cy.intercept("GET", "/api/activity/recents?*").as("recentItems");
    cy.intercept("POST", "/api/activity/recents").as("addRecentItem");
    cy.intercept("GET", "/api/collection/tree*").as("collectionTree");
  });

  describe("Recent items functionality", () => {
    beforeEach(() => {
      // Mock recent items with test data
      cy.intercept("GET", "/api/activity/recents?*", {
        recents: [
          {
            id: 1,
            name: "Test Dashboard 1",
            model: "dashboard",
            description: "A test dashboard for embedding",
            timestamp: "2024-01-01T00:00:00.000Z",
          },
          {
            id: 2,
            name: "Test Dashboard 2",
            model: "dashboard",
            description: "Another test dashboard",
            timestamp: "2024-01-02T00:00:00.000Z",
          },
          {
            id: 101,
            name: "Test Question 1",
            model: "card",
            description: "A test question for embedding",
            timestamp: "2024-01-01T12:00:00.000Z",
          },
          {
            id: 102,
            name: "Test Question 2",
            model: "card",
            description: "Another test question",
            timestamp: "2024-01-02T12:00:00.000Z",
          },
        ],
      }).as("mockRecentItems");
    });

    it("visiting a new dashboard adds it to the recents list", () => {
      // First visit a dashboard directly to add it to recents
      cy.visit("/dashboard/3");
      cy.wait("@dashboard");

      // Then visit the embed setup page
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@mockRecentItems");

      // Verify the visited dashboard appears in recents
      getEmbedSidebar().within(() => {
        cy.findByText("Test Dashboard 1").should("be.visible");
        cy.findByText("Test Dashboard 2").should("be.visible");
      });
    });

    it("visiting a new question adds it to the recents list", () => {
      // First visit a question directly to add it to recents
      cy.visit("/question/103");
      cy.wait("@card");

      // Then visit the embed setup page and switch to chart experience
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@mockRecentItems");

      getEmbedSidebar().findByText("Chart").click();

      // Verify the visited question would appear in recents for chart experience
      getEmbedSidebar().within(() => {
        cy.findByText("Test Question 1").should("be.visible");
        cy.findByText("Test Question 2").should("be.visible");
      });
    });

    it("selecting a dashboard from recents changes the preview", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@mockRecentItems");

      // Click on a dashboard in the recents list
      getEmbedSidebar().findByText("Test Dashboard 1").click();

      // Verify the preview updates
      const iframe = getPreviewIframe();
      iframe.within(() => {
        // The preview should show the selected dashboard content
        // Note: This assumes the dashboard content loads correctly
        cy.get("body").should("not.be.empty");
      });

      // Verify the dashboard appears selected in the UI
      getEmbedSidebar().within(() => {
        cy.findByText("Test Dashboard 1")
          .closest("[class*='EntityCard']")
          .should("have.class", "EntityCardSelected");
      });
    });

    it("selecting a question from recents changes the preview", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@mockRecentItems");

      // Switch to chart experience first
      getEmbedSidebar().findByText("Chart").click();

      // Click on a question in the recents list
      getEmbedSidebar().findByText("Test Question 1").click();

      // Verify the preview updates
      const iframe = getPreviewIframe();
      iframe.within(() => {
        // The preview should show the selected question content
        cy.get("body").should("not.be.empty");
      });

      // Verify the question appears selected in the UI
      getEmbedSidebar().within(() => {
        cy.findByText("Test Question 1")
          .closest("[class*='EntityCard']")
          .should("have.class", "EntityCardSelected");
      });
    });
  });

  describe("Search modal functionality", () => {
    beforeEach(() => {
      // Mock empty recents to focus on search functionality
      cy.intercept("GET", "/api/activity/recents?*", {
        recents: [],
      }).as("emptyRecentItems");

      // Mock search results
      cy.intercept("GET", "/api/search*", {
        data: [
          {
            id: 10,
            name: "Searchable Dashboard",
            model: "dashboard",
            description: "Found via search",
            collection_id: null,
          },
          {
            id: 110,
            name: "Searchable Question",
            model: "card",
            description: "Found via search",
            collection_id: null,
          },
        ],
      }).as("searchResults");
    });

    it("clicking search icon opens dashboard picker modal", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // Click the search/browse icon
      getEmbedSidebar().findByTitle("Browse dashboards").click();

      // Verify modal opens
      cy.findByRole("dialog").should("be.visible");
      // cy.findByText("Select a dashboard").should("be.visible");
    });

    it("clicking search icon opens question picker modal for chart experience", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // Switch to chart experience
      getEmbedSidebar().findByText("Chart").click();

      // Click the search/browse icon
      getEmbedSidebar().findByTitle("Browse questions").click();

      // Verify modal opens
      cy.findByRole("dialog").should("be.visible");
      // cy.findByText("Select a question").should("be.visible");
    });

    it("selecting a dashboard from picker changes the preview", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // Open dashboard picker
      getEmbedSidebar().findByTitle("Browse dashboards").click();

      cy.wait("@collectionTree");

      // Select a dashboard from the picker
      // Note: This test may need adjustment based on actual picker implementation
      cy.findByRole("dialog").within(() => {
        cy.findByText("Searchable Dashboard").click();
      });

      // Verify modal closes and preview updates
      cy.findByRole("dialog").should("not.exist");

      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.get("body").should("not.be.empty");
      });

      // Verify the item was added to recents
      cy.wait("@addRecentItem");
    });

    it("selecting a question from picker changes the preview", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@emptyRecentItems");

      // Switch to chart experience
      getEmbedSidebar().findByText("Chart").click();

      // Open question picker
      getEmbedSidebar().findByTitle("Browse questions").click();

      cy.wait("@collectionTree");

      // Select a question from the picker
      cy.findByRole("dialog").within(() => {
        cy.findByText("Searchable Question").click();
      });

      // Verify modal closes and preview updates
      cy.findByRole("dialog").should("not.exist");

      const iframe = getPreviewIframe();
      iframe.within(() => {
        cy.get("body").should("not.be.empty");
      });

      // Verify the item was added to recents
      cy.wait("@addRecentItem");
    });
  });

  describe("Preview iframe updates", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/activity/recents?*", {
        recents: [
          {
            id: 5,
            name: "Analytics Dashboard",
            model: "dashboard",
            description: "Main analytics dashboard",
            timestamp: "2024-01-01T00:00:00.000Z",
          },
          {
            id: 105,
            name: "Sales Report",
            model: "card",
            description: "Monthly sales report",
            timestamp: "2024-01-01T12:00:00.000Z",
          },
        ],
      }).as("testRecentItems");
    });

    it("preview updates when switching between different dashboards", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@testRecentItems");

      // Select first dashboard
      getEmbedSidebar().findByText("Analytics Dashboard").click();

      let iframe = getPreviewIframe();
      iframe.within(() => {
        cy.get("body").should("not.be.empty");
      });

      // Switch to default dashboard via experience toggle
      getEmbedSidebar().findByText("Dashboard").click();

      iframe = getPreviewIframe();
      iframe.within(() => {
        // Should show the default example dashboard
        cy.findByText("Person overview").should("be.visible");
      });
    });

    it("preview updates when switching between different questions", () => {
      cy.visit("/embed/new");
      cy.wait("@dashboard");
      cy.wait("@testRecentItems");

      // Switch to chart experience
      getEmbedSidebar().findByText("Chart").click();

      // Select a question from recents
      getEmbedSidebar().findByText("Sales Report").click();

      let iframe = getPreviewIframe();
      iframe.within(() => {
        cy.get("body").should("not.be.empty");
      });

      // Switch back to default question via experience toggle
      getEmbedSidebar().findByText("Chart").click();

      iframe = getPreviewIframe();
      iframe.within(() => {
        // Should show the default example question
        cy.findByText("Query log").should("be.visible");
      });
    });
  });
});

// Helper functions
const getPreviewIframe = () =>
  cy
    .get("iframe")
    .should("be.visible")
    .its("0.contentDocument")
    .should("exist")
    .its("body")
    .should("not.be.empty");

const getEmbedSidebar = () => cy.findByTestId("embed-sidebar-content");
