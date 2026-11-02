const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

const visitEmbeddingWithSearch = (url = "/") => {
  H.visitFullAppEmbeddingUrl({
    url: url,
    qs: {
      top_nav: true,
      search: true,
    },
  });
};

describe("scenarios > search", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("GET", "/api/search?q=*").as("search");
    cy.signInAsAdmin();
  });

  describe("universal search", () => {
    it("should work for admin (metabase#20018)", () => {
      visitEmbeddingWithSearch("/");

      H.getSearchBar().type("pers");
      cy.wait("@search");
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByTestId("search-results-list").within(() => {
        cy.findAllByText(/personal collection$/i).should(
          "have.length",
          Object.entries(USERS).length,
        );
      });

      H.getSearchBar().as("searchBox").clear().type("orders count").blur();

      H.expectSearchResultContent({
        expectedSearchResults: [
          {
            name: /Orders, Count, Grouped by/i,
            icon: "line",
          },
        ],
        strict: false,
      });

      H.getSearchBar().clear().type("product").blur();

      cy.wait("@search");

      H.expectSearchResultContent({
        expectedSearchResults: [
          {
            name: "Products",
            description:
              "Includes a catalog of all the products ever sold by the famed Sample Company.",
            collection: "Sample Database",
          },
        ],
        strict: false,
      });

      cy.get("@searchBox").type("{enter}");
      cy.wait("@search");

      cy.location("pathname").should("eq", "/search");
      cy.findByTestId("search-app")
        .findByText('Results for "product"')
        .should("exist");
      cy.findByTestId("search-app").within(() => {
        H.expectSearchResultContent({
          expectedSearchResults: [
            {
              name: "Products",
              description:
                "Includes a catalog of all the products ever sold by the famed Sample Company.",
            },
          ],
          strict: false,
        });
      });
    });

    it("should work for user with permissions (metabase#12332)", () => {
      cy.signInAsNormalUser();
      visitEmbeddingWithSearch("/");

      H.getSearchBar().type("pers");
      cy.wait("@search");
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByTestId("search-results-list").within(() => {
        cy.findAllByText(/personal collection$/i).should("have.length", 1);
      });

      H.getSearchBar().clear().type("product{enter}");
      cy.wait("@search");
      cy.findByTestId("search-app").within(() => {
        cy.findByText("Products");
      });
    });

    it("should work for user without data permissions (metabase#16855)", () => {
      cy.signIn("nodata");
      visitEmbeddingWithSearch("/");
      H.getSearchBar().type("product{enter}");
      cy.wait("@search");
      cy.findByTestId("search-app").within(() => {
        cy.findByText("Didn't find anything");
      });
    });

    it("allows to select a search result using keyboard", () => {
      cy.signInAsNormalUser();
      visitEmbeddingWithSearch("/");
      H.getSearchBar().type("ord");

      cy.wait("@search");

      cy.findByTestId("app-bar").findByDisplayValue("ord");
      cy.findAllByTestId("search-result-item-name")
        .first()
        .should("have.text", "Orders in a dashboard");

      cy.realPress("ArrowDown");
      cy.realPress("ArrowDown");
      cy.realPress("ArrowDown");
      cy.realPress("ArrowDown");
      cy.realPress("Enter");

      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_QUESTION_ID}-orders`,
      );

      cy.get("@search.all").should("have.length", 1);
    });

    it("should render a preview of markdown descriptions", () => {
      H.createQuestion({
        name: "Description Test",
        query: { "source-table": ORDERS_ID },
        description: `![alt](https://upload.wikimedia.org/wikipedia/commons/a/a2/Cat_outside.jpg)

        Lorem ipsum dolor sit amet.

        ----

        ## Heading 1

        This is a [link](https://upload.wikimedia.org/wikipedia/commons/a/a2/Cat_outside.jpg).

        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. `,
      }).then(() => {
        cy.signInAsNormalUser();
        visitEmbeddingWithSearch("/");
        H.getSearchBar().type("Test");
      });

      //Enseure that text is ellipsified
      cy.findByTestId("result-description")
        .findByText(/Lorem ipsum dolor sit amet./)
        .then((el) => H.assertIsEllipsified(el[0]));

      //Ensure that images are not being rendered in the descriptions
      cy.findByTestId("result-description")
        .findByRole("img")
        .should("not.exist");
    });

    it("should not dismiss when a dashboard finishes loading, when visited directly or after a homepage redirect (metabase#35099, metabase#34226)", () => {
      cy.intercept(
        {
          url: `/api/dashboard/${ORDERS_DASHBOARD_ID}`,
          method: "GET",
          middleware: true,
        },
        (req) => {
          req.continue((res) => {
            res.delay = 1000;
            res.send();
          });
        },
      );

      visitEmbeddingWithSearch(`/dashboard/${ORDERS_DASHBOARD_ID}`);

      // Type as soon as possible, before the dashboard has finished loading
      H.getSearchBar().type("ord");

      // Once the dashboard is visible, the search results should not be dismissed
      cy.findByTestId("dashboard-parameters-and-cards").should("exist");
      cy.findByTestId("search-results-floating-container").should("exist");

      H.updateSetting("custom-homepage", true);
      H.updateSetting("custom-homepage-dashboard", ORDERS_DASHBOARD_ID);
      visitEmbeddingWithSearch("/");

      // Type as soon as possible, before the dashboard has finished loading
      H.getSearchBar().type("ord");

      // Once the dashboard is visible, the search results should not be dismissed
      cy.findByTestId("dashboard-parameters-and-cards").should("exist");

      cy.findByTestId("search-results-floating-container").should("exist");
    });
  });

  describe("accessing full page search with `Enter`", () => {
    it("should only search and open full page search when a text query is entered", () => {
      cy.intercept("GET", "/api/activity/recents?*").as("getRecentViews");
      cy.intercept({
        method: "GET",
        pathname: "/api/search",
        query: { context: "search-bar" },
      }).as("searchBarSearch");
      cy.intercept({
        method: "GET",
        pathname: "/api/search",
        query: { context: "search-app" },
      }).as("searchAppSearch");

      visitEmbeddingWithSearch("/");

      H.getSearchBar().click().type("{enter}");

      cy.wait("@getRecentViews");

      cy.findByTestId("search-results-floating-container").within(() => {
        cy.findByText("Recently viewed").should("exist");
      });
      cy.location("pathname").should("eq", "/");

      cy.clock(Date.now(), ["setTimeout", "clearTimeout"]);
      H.getSearchBar().type(" ").should("have.value", " ");
      cy.tick(SEARCH_DEBOUNCE_DURATION);
      cy.findByTestId("search-results-floating-container").within(() => {
        cy.findByText("Recently viewed").should("exist");
      });
      H.getSearchBar().type("{enter}");
      cy.location("pathname").should("eq", "/");
      cy.get("@searchBarSearch.all").should("have.length", 0);

      H.getSearchBar().clear().type("ord").should("have.value", "ord");
      cy.tick(SEARCH_DEBOUNCE_DURATION);
      cy.wait("@searchBarSearch");
      cy.findByTestId("search-bar-results-container").should("be.visible");

      H.getSearchBar().clear().type(" ").should("have.value", " ");
      cy.tick(SEARCH_DEBOUNCE_DURATION);
      cy.findByTestId("search-results-floating-container")
        .findByText("Recently viewed")
        .should("be.visible");
      cy.findByTestId("search-bar-results-container").should("not.exist");
      cy.get("@searchBarSearch.all").should("have.length", 1);
      cy.clock().invoke("restore");

      H.getSearchBar().clear().type("orders{enter}");
      cy.wait("@searchAppSearch");

      cy.findByTestId("search-app").within(() => {
        cy.findByText('Results for "orders"').should("exist");
      });

      cy.location().should((loc) => {
        expect(loc.pathname).to.eq("/search");
        expect(loc.search).to.eq("?q=orders");
      });
    });
  });
});

describe("issue 28788", () => {
  const LONG_STRING = "01234567890ABCDEFGHIJKLMNOPQRSTUVXYZ0123456789";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("search results should not overflow or scroll horizontally with long names and descriptions (metabase#28788)", () => {
    cy.signInAsAdmin();
    H.createQuestion({
      name: "Description Test",
      query: { "source-table": ORDERS_ID },
      description:
        "testingtestingtestingtestingtestingtestingtestingtesting testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting",
    });
    cy.signInAsNormalUser();

    const questionDetails = {
      name: `28788-${LONG_STRING}`,
      type: "model",
      description: LONG_STRING,
      query: {
        "source-table": PEOPLE_ID,
      },
    };

    H.createCollection({
      name: `Collection-${LONG_STRING}`,
    }).then(({ body: collection }) => {
      H.createQuestion({
        ...questionDetails,
        collection_id: collection.id,
      });
    });

    H.visitFullAppEmbeddingUrl({
      url: "/",
      qs: { top_nav: true, search: true },
    });
    cy.findByPlaceholderText("Search…").type(questionDetails.name);

    cy.findByTestId("search-results-list")
      .should("contain.text", questionDetails.name)
      .find("ul")
      .should(($list) => {
        expect(H.isScrollableHorizontally($list[0])).to.be.false;
      });

    cy.findByPlaceholderText("Search…").clear().type("Test");
    cy.findByTestId("search-results-floating-container")
      .invoke("outerWidth")
      .then((parentWidth) => {
        cy.contains("[data-testid=search-result-item]", "Description Test")
          .findByTestId("result-description")
          .invoke("outerWidth")
          .should(
            "be.lessThan",
            parentWidth,
            "Result description width should not exceed parent container width",
          );
      });
  });
});

describe("command palette", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("search-typeahead-enabled", false);
    cy.visit("/");
  });

  it("should not display search results in the palette when search-typeahead-enabled is false", () => {
    H.commandPaletteButton().click();
    H.commandPaletteInput().type("ord");
    H.commandPalette()
      .findByRole("option", { name: /View search results/ })
      .should("exist");
  });
});
