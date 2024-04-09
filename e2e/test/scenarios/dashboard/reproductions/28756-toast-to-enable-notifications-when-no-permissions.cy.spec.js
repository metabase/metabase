import { assoc } from "icepick";
import _ from "underscore";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore, undoToast, visitDashboard } from "e2e/support/helpers";
import { DASHBOARD_SLOW_TIMEOUT } from "metabase/dashboard/constants";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const UNRESTRICTED_COLLECTION_NAME = "Unrestricted collection";
const RESTRICTED_COLLECTION_NAME = "Restricted collection";

const ADMIN_GROUP_ID = "2";

const TOAST_TIMEOUT_SAFETY_MARGIN = 1000;
const TOAST_TIMEOUT = DASHBOARD_SLOW_TIMEOUT + TOAST_TIMEOUT_SAFETY_MARGIN;
const TOAST_MESSAGE =
  "Would you like to be notified when this dashboard is done loading?";

describe("issue 28756", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createCollection({ name: RESTRICTED_COLLECTION_NAME }).then(
      ({ body: restrictedCollection }) => {
        restrictCollectionForNonAdmins(restrictedCollection.id);

        cy.createCollection({ name: UNRESTRICTED_COLLECTION_NAME }).then(
          ({ body: unrestrictedCollection }) => {
            cy.createQuestionAndDashboard({
              dashboardDetails: {
                collection_id: unrestrictedCollection.id,
              },
              questionDetails: {
                name: "28756 Question",
                query: {
                  "source-table": PRODUCTS_ID,
                },
                collection_id: restrictedCollection.id,
              },
            }).then(({ body: { dashboard_id } }) => {
              cy.wrap(dashboard_id).as("dashboardId");
            });
          },
        );
      },
    );
  });

  it("should not show a toast to enable notifications to user with no permissions to see the card (metabase#28756)", () => {
    cy.signInAsNormalUser();
    cy.clock();

    cy.get("@dashboardId").then(dashboardId => {
      visitDashboard(dashboardId);
      cy.tick(TOAST_TIMEOUT);

      undoToast().should("not.exist");
      cy.findByText(TOAST_MESSAGE).should("not.exist");
    });
  });
});

function restrictCollectionForNonAdmins(collectionId) {
  cy.request("GET", "/api/collection/graph").then(
    ({ body: { revision, groups } }) => {
      cy.request("PUT", "/api/collection/graph", {
        revision,
        groups: _.mapObject(groups, (groupPermissions, groupId) => {
          const permission = groupId === ADMIN_GROUP_ID ? "write" : "none";
          return assoc(groupPermissions, collectionId, permission);
        }),
      });
    },
  );
}
