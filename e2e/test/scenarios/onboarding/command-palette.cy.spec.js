const { H } = cy;

import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockDocument,
} from "metabase-types/api/mocks";

const TAB_1 = {
  id: 1,
  name: "Tab 1",
};

const TAB_2 = {
  id: 2,
  name: "Tab 2",
};

const TAB_3 = {
  id: 3,
  name: "Tab 3",
};

const TAB_4 = {
  id: 4,
  name: "Tab 4",
};

/**
 * When keys are pressed too fast redux won't have enough time to update the state,
 * so conditions in subsequently called event handlers may not have been updated yet.
 */
const REAL_PRESS_DELAY = 1;

describe("command palette", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render a searchable command palette", () => {
    // we return a list of entities in a specific order to avoid flakiness. "recency" score can sometimes cause the order to change and fail the test
    cy.intercept(
      "GET",
      "**/search?q=Company&context=command-palette&include_dashboard_questions=true&limit=20",
      (req) => {
        req.reply((res) => {
          const orderedNames = ["Products", "Orders", "Reviews", "People"];
          res.body.data = res.body.data.sort((a, b) => {
            return orderedNames.indexOf(a.name) - orderedNames.indexOf(b.name);
          });
          return res.body;
        });
      },
    );

    // //Add a description for a check
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      description: "The best question",
    });

    //Request to have an item in the recents list
    cy.request(`/api/dashboard/${ORDERS_DASHBOARD_ID}`);

    cy.visit("/");

    cy.findByRole("button", { name: /search/i }).click();
    H.commandPalette().should("be.visible");
    cy.findByRole("option", { name: "Orders in a dashboard" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
    H.closeCommandPalette();
    H.commandPalette().should("not.exist");

    cy.log("open the command palette with keybinding");
    H.openCommandPalette();
    H.commandPalette().within(() => {
      H.commandPaletteInput().should("exist");

      cy.log("does not show actions if there is no search query");
      cy.findByText("New question").should("not.exist");
      cy.findByText("New SQL query").should("not.exist");
      cy.findByText("New dashboard").should("not.exist");
      cy.findByText("New collection").should("not.exist");
      cy.findByText("New model").should("not.exist");
      cy.findByText("New metric").should("not.exist");

      cy.log("Should show recent items");
      cy.findByRole("option", { name: "Orders in a dashboard" }).should(
        "contain.text",
        "Our analytics",
      );

      cy.log("Should search entities and docs");
      H.commandPaletteInput().type("Orders, Count");

      cy.findByRole("option", { name: "Orders, Count" })
        .should("contain.text", "Our analytics")
        .should("contain.text", "The best question");

      cy.findByText('Search Metabase\'s docs for "Orders, Count"').should(
        "exist",
      );

      // Since the command palette list is virtualized, we will search for a few
      // to ensure they're reachable
      H.commandPaletteInput().clear().type("People");
      cy.findByRole("option", { name: "People" }).should("exist");

      H.commandPaletteInput().clear().type("Uploads");
      cy.findByRole("option", { name: "Settings - Uploads" }).should("exist");

      // When entering a query, if there are results that come before search results, highlight
      // the first action, otherwise, highlight the first search result
      H.commandPaletteInput().clear().type("Form");
      cy.findByRole("option", { name: "Performance" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
      cy.findByRole("option", { name: /View and filter/ }).should("exist");

      // Check that we are not filtering search results by action name
      H.commandPaletteInput().clear().type("Company");
      cy.findByRole("option", { name: /View and filter/ }).should("exist");
      cy.findByRole("option", { name: "Products" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
      cy.findByRole("option", { name: "People" }).should("exist");
      cy.findByRole("option", { name: "Reviews" }).should("exist");
      H.commandPaletteInput().clear();

      H.commandPaletteInput().clear().type("New met");
      cy.findByText("New metric").should("exist");
    });

    cy.log("We can close the command palette using escape");
    H.closeCommandPalette();
    H.commandPalette().should("not.exist");

    H.openCommandPalette();

    H.commandPalette()
      .findByRole("option", { name: "Orders in a dashboard" })
      .should("have.attr", "aria-selected", "true");

    H.commandPaletteInput().type("New");
    H.commandPalette()
      .findByText(/loading/i)
      .should("not.exist");
    H.commandPalette().findByText("No results for “New”").should("be.visible");

    // Every "New …" action matches "New" equally, so the default order applies
    // and "New question" is first and selected by default.
    H.commandPalette()
      .findByRole("option", { name: "New question" })
      .should("have.attr", "aria-selected", "true");

    cy.wait(100); // pressing page down too fast does nothing
    H.pressPageDown();
    H.commandPalette()
      .findByRole("option", { name: "New model" })
      .should("have.attr", "aria-selected", "true");

    H.pressPageDown();
    H.commandPalette()
      .findByRole("option", { name: 'Search Metabase\'s docs for "New"' })
      .should("have.attr", "aria-selected", "true");

    H.pressPageUp();
    H.commandPalette()
      .findByRole("option", { name: "New model" })
      .should("have.attr", "aria-selected", "true");

    H.pressPageUp();
    H.commandPalette()
      .findByRole("option", { name: "New question" })
      .should("have.attr", "aria-selected", "true");

    H.pressEnd();
    H.commandPalette()
      .findByRole("option", { name: 'Search Metabase\'s docs for "New"' })
      .should("have.attr", "aria-selected", "true");

    H.pressHome();
    H.commandPalette()
      .findByRole("option", { name: "New question" })
      .should("have.attr", "aria-selected", "true");
  });

  it("should display search results in the order returned by the API", () => {
    cy.visit("/");

    cy.findByRole("button", { name: /search/i }).click();
    cy.intercept("/api/search?*").as("searchData");

    H.commandPalette().within(() => {
      H.commandPaletteInput().type("Cou");
      cy.wait("@searchData");
      cy.findByText("Loading...").should("not.exist");

      cy.get("@searchData").then(({ response }) => {
        const results = response.body.data;

        cy.findAllByRole("option")
          // filter out unrelated items, keep only options with data
          .invoke("slice", 3, -2)
          .should("have.length", results.length)
          .each(($option, index) => {
            cy.wrap($option).should("contain", results[index].name);
          });
      });
    });
  });

  // Making this a separate test for now because it requires the bleeding edge token, which
  // Enables a bunch of other stuff and messes up the "Renders a searchable command palette"
  // test. In the future, this can be integrated into the test above, or moved to a BE test
  it("should display collection names for documents in recents", () => {
    //Create a document so that it appears in the recents list
    cy.request(
      "POST",
      "/api/document",
      createMockDocument({ collection_id: ADMIN_PERSONAL_COLLECTION_ID }),
    );

    cy.visit("/");

    cy.findByRole("button", { name: /search/i }).click();
    H.commandPalette().should("be.visible");

    // UXW-1786
    cy.findByRole("option", { name: "Test Document" }).should(
      "contain.text",
      "Bobby Tables's Personal Collection",
    );
  });

  it("should not be accessible when doing full app embedding", () => {
    H.visitFullAppEmbeddingUrl({
      url: "/",
      qs: {
        top_nav: true,
        search: true,
      },
    });

    cy.findByPlaceholderText("Search…").click();
    cy.findByRole("button", { name: / \+ K/ }).should("not.exist");

    cy.get("body").type("{esc}");

    H.openCommandPalette();
    H.commandPalette().should("not.exist");
  });

  it("The Search button should resize when on mobile", () => {
    cy.viewport("iphone-x");
    cy.visit("/");
    H.commandPaletteButton().should("not.contain.text", "search");
  });

  it("Should have a new metric item", () => {
    cy.visit("/");
    cy.findByRole("button", { name: /search/i }).click();

    H.commandPalette().within(() => {
      H.commandPaletteInput().should("exist").type("Me");
      cy.findByText("New metric").should("be.visible").click();

      cy.location("pathname").should("eq", "/metric/new");
    });
  });

  it("should show the 'Download diagnostics' command palette item", () => {
    cy.visit("/");
    cy.findByRole("button", { name: /search/i }).click();

    H.commandPalette().within(() => {
      H.commandPaletteInput().should("exist").type("Issue");
      cy.findByText("Download diagnostics").should("be.visible");
    });
  });

  it("should allow searching personal collections if no results and user is admin", () => {
    cy.visit("/");
    cy.findByRole("button", { name: /search/i }).click();
    cy.realType("asdf");
    H.commandPalette()
      .get("#search-results-metadata")
      .should("contain", "Search everything");
  });

  it("should show the 'New embed' command palette item", () => {
    cy.visit("/");
    cy.findByRole("button", { name: /search/i }).click();

    H.commandPalette().within(() => {
      H.commandPaletteInput().should("exist").type("new embed");
      cy.findByText("New embed").should("be.visible");
    });
  });

  describe("ee", () => {
    beforeEach(() => {
      H.activateToken("pro-self-hosted");
    });

    it("should have a 'New document' item", () => {
      cy.visit("/");
      cy.findByRole("button", { name: /search/i }).click();
      H.commandPalette().within(() => {
        H.commandPaletteInput().should("be.visible").type("new document");
        cy.findByText("New document").should("be.visible").click();
        cy.location("pathname").should("eq", "/document/new");
      });
    });
  });
});

describe("shortcuts", { tags: ["@actions"] }, () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  it("should support dashboard shortcuts", () => {
    H.createDashboardWithTabs({
      tabs: [TAB_1, TAB_2, TAB_3, TAB_4],
      dashcards: [
        createMockDashboardCard({
          id: -1,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_1.id,
        }),
        createMockDashboardCard({
          id: -2,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_2.id,
        }),
        createMockDashboardCard({
          id: -3,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_3.id,
        }),
        createMockDashboardCard({
          id: -4,
          card_id: ORDERS_QUESTION_ID,
          dashboard_tab_id: TAB_4.id,
        }),
      ],
    }).then((dashboard) => H.visitDashboard(dashboard.id));

    H.openShortcutModal();
    H.shortcutModal().should("exist");
    cy.realPress("Escape");

    cy.realPress("o");
    H.openNavigationSidebar();
    H.navigationSidebar()
      .findByRole("section", { name: "Bookmarks" })
      .should("contain.text", "Test Dashboard");
    cy.realPress("o");
    H.navigationSidebar()
      .findByRole("section", { name: "Bookmarks" })
      .should("not.exist");

    cy.realPress("e");
    cy.findByTestId("edit-bar").should(
      "contain.text",
      "You're editing this dashboard",
    );
    cy.realPress("f");
    cy.findByRole("menu", { name: /add a filter/i }).should("exist");
    cy.realPress("Escape");
    cy.realPress("e");
    cy.findByTestId("edit-bar").should("not.exist");

    cy.realPress("]");
    cy.findByRole("dialog", { name: "Info" }).should("exist");
    cy.realPress("]");
    cy.findByRole("dialog", { name: "Info" }).should("not.exist");

    cy.findByRole("tab", { name: "Tab 1" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.realPress("3");
    cy.findByRole("tab", { name: "Tab 3" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.realPress("1");
    cy.findByRole("tab", { name: "Tab 1" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
    // Doesn't error on pressing numbers out of bounds
    cy.realPress("7");
    cy.findByRole("tab", { name: "Tab 1" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
  });

  it("should support query builder shortcuts", () => {
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

    // This is a bit strange, but we need to focus something or pressing f
    // will open expand the spec list in cypress
    // Filter
    cy.findByTestId("question-filter-header").should("exist").focus();
    cy.findByRole("dialog", { name: /filter/i }).should("not.exist");
    cy.realPress("f");
    cy.findByRole("dialog", { name: /filter/i }).should("exist");
    cy.realPress("Escape");

    // Summarize sidebar
    cy.realPress("s");
    cy.findByTestId("sidebar-content").should("contain.text", "Summarize by");
    cy.realPress("s");
    cy.findByTestId("sidebar-content").should("not.exist");

    // Sidesheet
    cy.realPress("]");
    cy.findByRole("dialog", { name: "Info" }).should("exist");
    cy.wait(REAL_PRESS_DELAY);
    cy.realPress("]");
    cy.findByRole("dialog", { name: "Info" }).should("not.exist");

    // Viz Settings
    cy.realPress("y");
    cy.findByTestId("chartsettings-sidebar").should("exist");
    cy.wait(REAL_PRESS_DELAY);
    cy.realPress("y");
    cy.findByTestId("chartsettings-sidebar").should("not.exist");

    // Viz toggle
    cy.findByTestId("visualization-root").should(
      "have.attr",
      "data-viz-ui-name",
      "Line",
    );
    cy.realPress("v");
    cy.findByTestId("visualization-root").should(
      "have.attr",
      "data-viz-ui-name",
      "Table",
    );

    // toggle notebook mode
    cy.findByTestId("step-data-0-0").should("not.exist");
    cy.realPress("e");
    cy.findByTestId("step-data-0-0").should("exist");
    cy.realPress("e");
    cy.findByTestId("step-data-0-0").should("not.exist");
    cy.findByTestId("visualization-root").should("exist");
  });
});
