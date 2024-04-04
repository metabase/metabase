import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  describeEE,
  modal,
  setTokenFeatures,
  popover,
  modifyPermission,
  assertPermissionTable,
  restore,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const NATIVE_QUERIES_PERMISSION_INDEX = 1;

describeEE(
  "scenarios > admin > permissions > view data > legacy no self-service",
  () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");
    });

    it("'no self service' should only be an option if it is the current value in the permissions graph", () => {
      // load the page like normal w/o legacy value in the graph
      // and test that it does not exist
      cy.visit(`/admin/permissions/data/group/${ALL_USERS_GROUP}`);

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sample Database").closest("tr").click();
      popover().should("not.contain", "No self-service (Deprecated)");

      // load the page w/ legacy value in the graph and test that it does exist
      cy.reload();
      cy.intercept("GET", `/api/permissions/graph/group/${ALL_USERS_GROUP}`, {
        statusCode: 200,
        body: {
          revision: 1,
          groups: {
            1: {
              1: {
                "view-data": "legacy-no-self-service",
                "create-queries": "query-builder-and-native",
              },
            },
          },
        },
      });

      assertPermissionTable([
        [
          "Sample Database",
          "No self-service (Deprecated)",
          "Query builder and native",
          "No",
          "No",
          "No",
        ],
      ]);

      modifyPermission(
        "Sample Database",
        DATA_ACCESS_PERMISSION_INDEX,
        "Can view",
      );

      modifyPermission(
        "Sample Database",
        DATA_ACCESS_PERMISSION_INDEX,
        "No self-service (Deprecated)",
      );

      // make a change so there's a diff in the graph allowing us to save
      modifyPermission(
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder only",
      );

      cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");

      cy.button("Save changes").click();

      modal().within(() => {
        cy.findByText("Save permissions?");
        cy.button("Yes").click();
      });

      // TODO: figure out why the BE won't accept the value...
      cy.wait("@saveGraph").then(({ response }) => {
        expect(response.statusCode).to.equal(200);
      });

      assertPermissionTable([
        [
          "Sample Database",
          "No self-service (Deprecated)",
          "Query builder only",
          "No",
          "No",
          "No",
        ],
      ]);
    });
  },
);
