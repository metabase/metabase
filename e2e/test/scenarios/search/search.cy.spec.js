const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID, PEOPLE_ID, REVIEWS_ID } = SAMPLE_DATABASE;

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
    H.restore("default", { reindex: true });
    cy.intercept("GET", "/api/search?q=*").as("search");
    cy.signInAsAdmin();
  });

  describe("universal search", () => {
    it("should work for admin (metabase#20018)", () => {
      visitEmbeddingWithSearch("/");
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

    it("should work for user with permissions (metabase#12332)", () => {
      cy.signInAsNormalUser();
      visitEmbeddingWithSearch("/");
      H.getSearchBar().type("product{enter}");
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

    it("should not overflow container if results contain descriptions with large unbroken strings", () => {
      H.createQuestion({
        name: "Description Test",
        query: { "source-table": ORDERS_ID },
        description:
          "testingtestingtestingtestingtestingtestingtestingtesting testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting testingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtestingtesting",
      }).then(() => {
        cy.signInAsNormalUser();
        visitEmbeddingWithSearch("/");
        H.getSearchBar().type("Test");
      });

      cy.findByTestId("search-results-floating-container")
        .as("parentContainer")
        .invoke("outerWidth")
        .then((parentWidth) => {
          cy.findByTestId("result-description")
            .invoke("outerWidth")
            .should(
              "be.lessThan",
              parentWidth,
              "Result description width should not exceed parent container width",
            );
        });
    });

    it("should not dismiss when a dashboard finishes loading (metabase#35009)", () => {
      visitEmbeddingWithSearch(`/dashboard/${ORDERS_DASHBOARD_ID}`);

      // Type as soon as possible, before the dashboard has finished loading
      H.getSearchBar().type("ord");

      // Once the dashboard is visible, the search results should not be dismissed
      H.main()
        .findByRole("heading", { name: "Loading..." })
        .should("not.exist");
      cy.findByTestId("search-results-floating-container").should("exist");
    });

    it("should not dismiss when the homepage redirects to a dashboard (metabase#34226)", () => {
      H.updateSetting("custom-homepage", true);
      H.updateSetting("custom-homepage-dashboard", ORDERS_DASHBOARD_ID);
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
      visitEmbeddingWithSearch("/");

      // Type as soon as possible, before the dashboard has finished loading
      H.getSearchBar().type("ord");

      // Once the dashboard is visible, the search results should not be dismissed
      cy.findByTestId("dashboard-parameters-and-cards").should("exist");

      cy.findByTestId("search-results-floating-container").should("exist");
    });
  });

  describe("accessing full page search with `Enter`", () => {
    it("should not render full page search if user has not entered a text query", () => {
      cy.intercept("GET", "/api/activity/recents?*").as("getRecentViews");

      visitEmbeddingWithSearch("/");

      H.getSearchBar().click().type("{enter}");

      cy.wait("@getRecentViews");

      cy.findByTestId("search-results-floating-container").within(() => {
        cy.findByText("Recently viewed").should("exist");
      });
      cy.location("pathname").should("eq", "/");
    });

    it("should render full page search when search text is present and user clicks 'Enter'", () => {
      visitEmbeddingWithSearch("/");

      H.getSearchBar().click().type("orders{enter}");
      cy.wait("@search");

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

describe("issue 16785", { tags: "@skip" }, () => {
  beforeEach(() => {
    H.restore("default", { reindex: true });
    cy.signInAsAdmin();

    cy.request("PUT", "/api/table", {
      ids: [REVIEWS_ID],
      visibility_type: "hidden",
    });
  });

  it("should not display hidden tables (metabase#16785)", () => {
    cy.visit("/");
    cy.findByPlaceholderText("Search…").type("Reviews");

    cy.findByTestId("search-results-list").within(() => {
      cy.findByText("Reviews").should("not.exist");
    });
  });
});

describe("issue 28788", () => {
  const LONG_STRING = "01234567890ABCDEFGHIJKLMNOPQRSTUVXYZ0123456789";

  beforeEach(() => {
    H.restore("default", { reindex: true });
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/search*").as("search");
  });

  it("search results container should not be scrollable horizontally (metabase#28788)", () => {
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
    cy.wait("@search");
    cy.icon("hourglass").should("not.exist");

    cy.findByTestId("search-bar-results-container").then(($container) => {
      expect(H.isScrollableHorizontally($container[0])).to.be.false;
    });
  });
});
