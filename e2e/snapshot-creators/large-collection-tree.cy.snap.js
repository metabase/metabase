import { restore, snapshot } from "e2e/support/helpers";

/**
 * A snapshot with enough collections to push `GET /api/collection/tree?lazy=true` past its budget, so the nav sidebar
 * loads a level at a time.
 *
 * The default snapshot stays well under the budget and covers the other branch, where the whole tree arrives at once.
 */

/** Comfortably over the e2e budget of 50, and small enough that seeding stays quick. */
const ROOT_COLLECTION_COUNT = 90;

/**
 * One branch deep enough to check that expanding and deep linking fetch the levels they need.
 *
 * The sidebar sorts by name and scrolls, so these are named to sort above the filler collections. Otherwise they land
 * below 90 rows, outside the scroll container, and Cypress rightly refuses to call them visible.
 */
const NESTED_COLLECTION_NAMES = [
  "Deep root",
  "Deep child",
  "Deep grandchild",
  "Deep great grandchild",
];

describe("snapshots", () => {
  describe("large collection tree", () => {
    it("large-collection-tree", () => {
      restore("default");
      cy.signInAsAdmin();

      for (let index = 1; index <= ROOT_COLLECTION_COUNT; index++) {
        createCollection(
          `Filler collection ${String(index).padStart(3, "0")}`,
          null,
        );
      }

      createNestedCollections(NESTED_COLLECTION_NAMES, null);

      snapshot("large-collection-tree");

      restore("blank");
    });
  });
});

function createCollection(name, parentId) {
  return cy
    .request("POST", "/api/collection", { name, parent_id: parentId })
    .then(({ body }) => body.id);
}

function createNestedCollections([name, ...rest], parentId) {
  if (!name) {
    return;
  }
  createCollection(name, parentId).then((id) =>
    createNestedCollections(rest, id),
  );
}
