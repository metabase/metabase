import { P, isMatching } from "ts-pattern";

import { SAMPLE_DB_TABLES } from "e2e/support/cypress_data";
import type { CardId, CollectionId, DashboardId } from "metabase-types/api";

const { H } = cy;
const { STATIC_ORDERS_ID } = SAMPLE_DB_TABLES;

describe("scenarios > collections > clean up", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should be able to move stale items to the trash", () => {
    seedTestData().then(
      ({ collectionId, staleItemCount, notStaleItemCount }) => {
        cy.log("should be able to navigate to clean up modal");
        H.visitCollection(collectionId);
        H.openCollectionMenu();
        H.popover().findByText("Clear out unused items").click();
        cy.url().should("include", "cleanup");
        assertStaleItemCount(staleItemCount);

        cy.log("should be able to move stale items to the trash");
        selectAllItems();
        moveToTrash();
        assertNoPagination();

        H.expectUnstructuredSnowplowEvent(
          (event: unknown) =>
            isMatching(
              {
                event: "moved-to-trash",
                // `bulkCreateQuestions` seeds `type: "model"` cards, and the
                // stale listing labels those `model: "dataset"`.
                event_detail: P.union("dashboard", "dataset"),
                target_id: P.number,
                triggered_from: "cleanup_modal",
                duration_ms: P.number,
                result: "success",
              },
              event,
            ),
          10,
        );
        // cutoff_date is relative to today: Snowplow checks its format
        H.expectUnstructuredSnowplowEvent((event: unknown) =>
          isMatching(
            {
              event: "stale_items_archived",
              collection_id: collectionId,
              total_items_archived: 10,
              cutoff_date: P.string,
            },
            event,
          ),
        );

        cy.log("should be able to undo");
        H.undo();
        assertStaleItemCount(staleItemCount);

        selectAllItems();
        moveToTrash();
        assertNoPagination();
        selectAllItems();
        moveToTrash();
        cleanUpModal()
          .findByText(/All items have been used in the past/)
          .should("be.visible");

        cy.findByTestId("cleanup-collection-modal-close-btn").click();
        cy.url().should("not.include", "cleanup");

        cy.log("the collection items should reflect the trashed items");
        assertCollectionRowCount(notStaleItemCount);
        cy.reload();
        assertCollectionRowCount(notStaleItemCount);
      },
    );
  });
});

const cleanUpModal = () => cy.findByTestId("cleanup-collection-modal");

const selectAllItems = () => {
  cleanUpModal()
    .findAllByTestId("clean-up-table-check")
    .click({ multiple: true });
};

const moveToTrash = () => {
  cy.findByTestId("toast-card")
    .should("be.visible")
    .findByText("Move to trash")
    .click();
};

const assertNoPagination = () => {
  cleanUpModal()
    .findByTestId("cleanup-collection-modal-pagination")
    .should("not.exist");
};

const assertStaleItemCount = (itemCount: number) => {
  cleanUpModal()
    .findByTestId("pagination-total")
    .should("have.text", `${itemCount}`);
};

const assertCollectionRowCount = (itemCount: number) => {
  // + 1 for the header row
  H.main()
    .find("tr")
    .should("have.length", itemCount + 1);
};

const bulkCreateQuestions = (
  amount: number,
  collectionId: CollectionId,
): Cypress.Chainable<CardId[]> =>
  cy
    .wrap(Array.from({ length: amount }, (_, index) => amount - index))
    .then((numbers) => {
      const ids: CardId[] = [];
      numbers.forEach((n) => {
        H.createQuestion({
          name: `Bulk question ${n}`,
          query: { "source-table": STATIC_ORDERS_ID },
          type: "model",
          collection_id: collectionId,
        }).then(({ body }) => ids.push(body.id));
      });
      return cy.wrap(ids);
    });

const bulkCreateDashboards = (
  amount: number,
  collectionId: CollectionId,
): Cypress.Chainable<DashboardId[]> =>
  cy
    .wrap(Array.from({ length: amount }, (_, index) => amount - index))
    .then((numbers) => {
      const ids: DashboardId[] = [];
      numbers.forEach((n) => {
        H.createDashboard({
          name: `Bulk dashboard ${n}`,
          collection_id: collectionId,
        }).then(({ body }) => ids.push(body.id));
      });
      return cy.wrap(ids);
    });

// Backdates the last use of an item by 7 months
const makeItemsStale = (
  ids: (CardId | DashboardId)[],
  model: "card" | "dashboard",
) => {
  ids.forEach((id) => {
    cy.request("POST", "/api/testing/mark-stale", { id, model });
  });
};

// A collection with 12 models and 9 dashboards. 8 models and 6 dashboards are
// stale: more than one page in the modal, but few enough that trashing one page
// leaves a single page. The other 7 items stay in use.
function seedTestData() {
  return H.createCollection({ name: "Clean up test" }).then(
    ({ body: { id: collectionId } }) =>
      bulkCreateQuestions(12, collectionId).then((questionIds) => {
        makeItemsStale(questionIds.slice(0, 8), "card");
        return bulkCreateDashboards(9, collectionId).then((dashboardIds) => {
          makeItemsStale(dashboardIds.slice(0, 6), "dashboard");
          return cy.wrap({
            collectionId,
            staleItemCount: 14,
            notStaleItemCount: 7,
          });
        });
      }),
  );
}
