import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  COLLECTION_GROUP_ID,
  DATA_GROUP_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type DataApp,
  DataPermission,
  DataPermissionValue,
} from "metabase-types/api";

const { H } = cy;

const DATA_APP_NAME = "user-access-test";

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

const NORMAL_USER_NAME = `${USERS.normal.first_name} ${USERS.normal.last_name}`;
const NODATA_USER_NAME = `${USERS.nodata.first_name} ${USERS.nodata.last_name}`;

describe("scenarios > data apps > user access (EMB-2328)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.request<DataApp>("POST", `/api/apps/${DATA_APP_NAME}/draft`).then(
      ({ body: app }) => {
        expect(app.permission_group_id).not.to.be.null;

        cy.wrap(app.permission_group_id, { log: false }).as("dataAppGroupId");
      },
    );
  });

  it("adds and removes a data app user", () => {
    cy.request("PUT", `/api/apps/${DATA_APP_NAME}/table-dependencies`, {
      table_ids: [],
    });

    cy.visit("/admin/settings/apps");
    openManageUserAccessFromAppRow();

    cy.location("pathname").should(
      "eq",
      `/admin/settings/apps/${DATA_APP_NAME}/users`,
    );

    H.main().within(() => {
      cy.findByRole("link", { name: "Data apps" }).should("be.visible");
      cy.findByText(DATA_APP_NAME).should("be.visible");
      cy.findByText("No one has access yet").should("be.visible");

      cy.findByRole("heading", { name: "Manage access to this app" }).should(
        "be.visible",
      );
    });

    cy.findByRole("button", { name: "Add users" }).click();

    cy.findByRole("textbox", { name: "Search for a user to add" }).type(
      USERS.normal.email,
    );

    H.popover().findByText(NORMAL_USER_NAME).click();

    cy.findByRole("button", { name: "Add" }).click();

    H.main().within(() => {
      cy.findByText(NORMAL_USER_NAME, { timeout: 20_000 }).should("be.visible");
      cy.findByText(USERS.normal.email).should("be.visible");
      cy.findByText("No one has access yet").should("not.exist");
    });

    cy.findByRole("button", { name: `Remove ${NORMAL_USER_NAME}` }).click();

    H.main().within(() => {
      cy.findByText("No one has access yet", { timeout: 20_000 }).should(
        "be.visible",
      );

      cy.findByText(NORMAL_USER_NAME).should("not.exist");
    });
  });

  it("shows warnings only for users missing effective data access", () => {
    // The no-data snapshot user belongs to both of these groups.
    // Block the products table in both groups.
    cy.updatePermissionsGraph({
      [ALL_USERS_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          [DataPermission.VIEW_DATA]: {
            PUBLIC: {
              [ORDERS_ID]: DataPermissionValue.UNRESTRICTED,
              [PRODUCTS_ID]: DataPermissionValue.BLOCKED,
            },
          },
        },
      },

      [COLLECTION_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          [DataPermission.VIEW_DATA]: {
            PUBLIC: {
              [ORDERS_ID]: DataPermissionValue.UNRESTRICTED,
              [PRODUCTS_ID]: DataPermissionValue.BLOCKED,
            },
          },
        },
      },

      [DATA_GROUP_ID]: {
        [SAMPLE_DB_ID]: {
          [DataPermission.VIEW_DATA]: {
            PUBLIC: {
              [ORDERS_ID]: DataPermissionValue.UNRESTRICTED,
              [PRODUCTS_ID]: DataPermissionValue.UNRESTRICTED,
            },
          },
        },
      },
    });

    cy.request("PUT", `/api/apps/${DATA_APP_NAME}/table-dependencies`, {
      table_ids: [ORDERS_ID, PRODUCTS_ID],
    });

    cy.get<number>("@dataAppGroupId").then((groupId) => {
      H.addUserToGroup(groupId, USERS.normal.email);
      H.addUserToGroup(groupId, USERS.nodata.email);
    });

    cy.visit("/admin/settings/apps");

    dataAppRow()
      .findByRole("link", {
        name: "Some users are missing data access.",
      })
      .should("be.visible")
      .click();

    cy.location("pathname").should(
      "eq",
      `/admin/settings/apps/${DATA_APP_NAME}/users`,
    );

    cy.findByRole("heading", { name: "Manage access to this app" }).should(
      "be.visible",
    );

    userRow(USERS.normal.email).within(() => {
      cy.findByText(NORMAL_USER_NAME).should("be.visible");

      cy.findByRole("button", { name: "Missing data access" }).should(
        "not.exist",
      );
    });

    userRow(USERS.nodata.email).within(() => {
      cy.findByText(NODATA_USER_NAME).should("be.visible");

      cy.findByRole("button", { name: "Missing data access" })
        .should("be.visible")
        .realHover();
    });

    cy.findByTestId("data-access-warning-popover").within(() => {
      cy.findByText(
        `${USERS.nodata.first_name} doesn’t have permission to view these tables used in this app:`,
      ).should("be.visible");

      cy.findByTestId("missing-tables-list").within(() => {
        cy.findAllByRole("link")
          .should("have.length", 3)
          .and("be.visible")
          .should(($links) => {
            expect(
              [...$links].map((link) => ({
                label: link.textContent,
                href: link.getAttribute("href"),
                target: link.getAttribute("target"),
                rel: link.getAttribute("rel"),
              })),
            ).to.deep.equal([
              {
                label: "Sample Database",
                href: `/admin/permissions/data/database/${SAMPLE_DB_ID}`,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              {
                label: "PUBLIC",
                href: `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC`,
                target: "_blank",
                rel: "noopener noreferrer",
              },
              {
                label: "Products",
                href: `/admin/permissions/data/database/${SAMPLE_DB_ID}/schema/PUBLIC/table/${PRODUCTS_ID}`,
                target: "_blank",
                rel: "noopener noreferrer",
              },
            ]);
          });

        cy.findByRole("link", { name: "Orders" }).should("not.exist");
      });
    });

    cy.findByRole("button", { name: `Remove ${NODATA_USER_NAME}` }).click();

    H.main().within(() => {
      cy.findByText(USERS.normal.email).should("be.visible");

      cy.findByText(USERS.nodata.email, { timeout: 20_000 }).should(
        "not.exist",
      );
    });

    cy.visit("/admin/settings/apps");
    dataAppRow().within(() => {
      cy.findByText(DATA_APP_NAME).should("be.visible");

      cy.findByRole("link", {
        name: "Some users are missing data access.",
      }).should("not.exist");
    });
  });
});

const dataAppRow = () =>
  cy
    .findByTestId(`data-app-list-item-${DATA_APP_NAME}`)
    .scrollIntoView()
    .should("be.visible");

function openManageUserAccessFromAppRow() {
  dataAppRow()
    .findByRole("button", { name: `Actions for ${DATA_APP_NAME}` })
    .click();

  H.popover().findByText("Manage user access").click();
}

const userRow = (email: string) => H.main().findByText(email).closest("tr");
