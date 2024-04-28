import { USER_GROUPS } from "e2e/support/cypress_data";
import {
  describeEE,
  modal,
  isPermissionDisabled,
  setTokenFeatures,
  popover,
  modifyPermission,
  assertPermissionTable,
  selectPermissionRow,
  restore,
} from "e2e/support/helpers";

const { ALL_USERS_GROUP } = USER_GROUPS;

const DATA_ACCESS_PERMISSION_INDEX = 0;
const NATIVE_QUERIES_PERMISSION_INDEX = 1;
const DOWNLOAD_RESULTS_PERMISSION_INDEX = 2;

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

      selectPermissionRow("Sample Database", DATA_ACCESS_PERMISSION_INDEX);
      popover().should("not.contain", "No self-service (Deprecated)");

      selectPermissionRow("Sample Database", NATIVE_QUERIES_PERMISSION_INDEX);
      isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", false);

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
                "create-queries": "no",
                download: { schemas: "full" },
              },
            },
          },
        },
      });

      assertPermissionTable([
        [
          "Sample Database",
          "No self-service (Deprecated)",
          "No",
          "1 million rows",
          "No",
          "No",
        ],
      ]);

      // User should not be able to modify Create queries permission while set to legacy-no-self-service
      isPermissionDisabled(NATIVE_QUERIES_PERMISSION_INDEX, "No", true);

      modifyPermission(
        "Sample Database",
        DATA_ACCESS_PERMISSION_INDEX,
        "Can view",
      );

      modifyPermission(
        "Sample Database",
        NATIVE_QUERIES_PERMISSION_INDEX,
        "Query builder and native",
      );

      modifyPermission(
        "Sample Database",
        DATA_ACCESS_PERMISSION_INDEX,
        "No self-service (Deprecated)",
      );

      // change something else so we can save
      modifyPermission(
        "Sample Database",
        DOWNLOAD_RESULTS_PERMISSION_INDEX,
        "No",
      );

      // User setting the value back to legacy-no-self-service should result in Create queries going back to No
      const finalExpectedRows = [
        [
          "Sample Database",
          "No self-service (Deprecated)",
          "No",
          "No",
          "No",
          "No",
        ],
      ];
      assertPermissionTable(finalExpectedRows);

      cy.intercept("PUT", "/api/permissions/graph").as("saveGraph");

      cy.button("Save changes").click();

      modal().within(() => {
        cy.findByText("Save permissions?");
        cy.button("Yes").click();
      });

      cy.wait("@saveGraph").then(({ response }) => {
        expect(response.statusCode).to.equal(200);
      });

      assertPermissionTable(finalExpectedRows);
    });
  },
);
