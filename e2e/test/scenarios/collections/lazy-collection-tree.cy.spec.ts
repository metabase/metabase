const { H } = cy;

/**
 * The collection tree endpoint adapts to the size of the instance, so both branches need covering.
 *
 * The default snapshot sits under the e2e budget, so its whole tree arrives in one response and the sidebar never
 * fetches again. The `large-collection-tree` snapshot sits over the budget, so the sidebar loads a level at a time.
 */
describe("scenarios > collections > lazy collection tree", () => {
  describe("small instance", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      cy.intercept("GET", "/api/collection/tree*").as("collectionTree");
    });

    it("should deliver the whole tree in one response and never fetch a level", () => {
      cy.visit("/");
      cy.wait("@collectionTree");

      cy.log("expanding a collection must not go back to the server");
      expandSidebarCollection("First collection");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Second collection/ })
        .should("be.visible");

      assertNoLevelWasFetched();
    });
  });

  describe("large instance", () => {
    beforeEach(() => {
      H.restore("large-collection-tree");
      cy.signInAsAdmin();
      cy.intercept("GET", "/api/collection/tree*").as("collectionTree");
    });

    it("should load levels on demand as collections are expanded", () => {
      cy.visit("/");
      cy.wait("@collectionTree");

      cy.log("the root level arrives without its children");
      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep root/ })
        .should("be.visible");
      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep child/ })
        .should("not.exist");

      cy.log("expanding fetches exactly that collection's children");
      expandSidebarCollection("Deep root");

      countLevelFetches().should("be.greaterThan", 0);

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep child/ })
        .should("be.visible");
      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep grandchild/ })
        .should("not.exist");
    });

    it("should drill deeper without another request, since the level below came along", () => {
      cy.visit("/");
      cy.wait("@collectionTree");

      expandSidebarCollection("Deep root");
      cy.wait("@collectionTree");

      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep child/ })
        .should("be.visible");

      cy.log("expanding one level further needs nothing from the server");
      countLevelFetches().then((levelFetchesSoFar) => {
        expandSidebarCollection("Deep child");

        // Asserting the render first, so the count is checked after the expansion actually happened.
        H.navigationSidebar()
          .findByRole("treeitem", { name: /Deep grandchild/ })
          .should("be.visible");

        countLevelFetches().should("equal", levelFetchesSoFar);
      });
    });

    it("should reveal the whole ancestor path when landing on a nested collection", () => {
      visitCollectionByName("Deep grandchild");
      cy.wait("@collectionTree");

      cy.log(
        "nothing was expanded by hand, so the deep link revealed the path",
      );
      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep root/ })
        .should("be.visible");
      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep child/ })
        .should("be.visible");
      H.navigationSidebar()
        .findByRole("treeitem", { name: /Deep grandchild/ })
        .should("be.visible");
    });
  });
});

function expandSidebarCollection(name: string) {
  H.navigationSidebar()
    .findByRole("treeitem", { name: new RegExp(name) })
    .findByRole("button")
    .click();
}

/**
 * How many times the sidebar asked for one collection's children.
 *
 * Counted rather than waited on, and filtered to those requests alone. The sidebar also reads further pages of the
 * root level on its own as the end of that level comes into reach, so the next request after an expand is not
 * reliably the expand's.
 */
function countLevelFetches() {
  return cy.get("@collectionTree.all").then((calls) => {
    // `cy.get` on an intercept alias yields the captured interceptions, but its subject is typed as a jQuery element.
    const interceptions = calls as unknown as { request: { url: string } }[];
    return interceptions.filter(({ request }) =>
      request.url.includes("collection-id="),
    ).length;
  });
}

/** Asserts the sidebar never asked for a single collection's children. */
function assertNoLevelWasFetched() {
  cy.get("@collectionTree.all").should((calls) => {
    // `cy.get` on an intercept alias yields the captured interceptions, but its subject is typed as a jQuery element.
    const interceptions = calls as unknown as { request: { url: string } }[];
    const levelFetches = interceptions
      .map(({ request }) => request.url)
      .filter((url) => url.includes("collection-id="));

    expect(levelFetches, "requests for a single collection's children").to.be
      .empty;
  });
}

function visitCollectionByName(name: string) {
  cy.request("GET", "/api/collection").then(({ body }) => {
    const collection = body.find(
      (candidate: { name: string }) => candidate.name === name,
    );
    expect(collection, `collection named ${name}`).to.exist;
    cy.visit(`/collection/${collection.id}`);
  });
}
