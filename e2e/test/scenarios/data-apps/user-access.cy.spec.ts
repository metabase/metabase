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
  type Table,
} from "metabase-types/api";

const { H } = cy;

const DATA_APP_NAME = "user-access-test";

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

const SYNCED_APP_SLUG = "good";
const ALLOWED_HOST = "https://secret-api.data-app.test";

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

  it("adds and removes a data app user by pasting a single email", () => {
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
    H.popover().findByText(NORMAL_USER_NAME).should("be.visible");

    cy.findByRole("textbox", { name: "Search for a user to add" })
      .paste(` ${USERS.normal.email.toUpperCase()} `)
      .should("have.value", "");

    cy.findByRole("button", { name: "Add" }).click();

    userRow(USERS.normal.email).should("be.visible");
    cy.reload();

    H.main().within(() => {
      cy.findByText(NORMAL_USER_NAME, { timeout: 20_000 }).should("be.visible");
      cy.findByText(USERS.normal.email).should("be.visible");
      cy.findByText("No one has access yet").should("not.be.visible");
    });

    cy.findByRole("button", { name: `Remove ${NORMAL_USER_NAME}` }).click();

    H.main().within(() => {
      cy.findByText("No one has access yet", { timeout: 20_000 }).should(
        "be.visible",
      );

      cy.findByText(NORMAL_USER_NAME).should("not.exist");
    });
  });

  it("adds users from comma-separated emails without duplicating existing members", () => {
    cy.get<number>("@dataAppGroupId").then((groupId) => {
      H.addUserToGroup(groupId, USERS.normal.email);
    });

    cy.visit(`/admin/settings/apps/${DATA_APP_NAME}/users`);
    userRow(USERS.normal.email).should("be.visible");

    cy.findByRole("button", { name: "Add users" }).click();
    H.popover().findByText(NODATA_USER_NAME).should("be.visible");

    cy.log("paste a comma-separated list of emails");
    cy.findByRole("textbox", { name: "Search for a user to add" })
      .paste(` ${USERS.normal.email}, ${USERS.nodata.email.toUpperCase()} `)
      .should("have.value", USERS.normal.email);

    cy.findByRole("button", { name: "Add" }).click();

    userRow(USERS.nodata.email).should("be.visible");
    cy.reload();

    cy.log("both users from the comma-separated list should be visible");
    userRow(USERS.normal.email).should("have.length", 1).and("be.visible");
    userRow(USERS.nodata.email).should("have.length", 1).and("be.visible");
  });

  // SQLite does not have a schema.
  // The visible hierarchy should be "[Database] > [Table]" in table warnings.
  it("links a missing-access warning to a table without a schema", () => {
    H.activateToken("pro-self-hosted");
    H.addSqliteDatabase();

    cy.get<number>("@sqliteID").then((databaseId) => {
      H.withDatabase(databaseId, ({ NUMBER_WITH_NULLS_ID }) => {
        cy.request<Table>("GET", `/api/table/${NUMBER_WITH_NULLS_ID}`)
          .its("body")
          .as("sqliteTable");
      });

      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP_ID]: {
          [databaseId]: {
            [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
          },
        },
        [COLLECTION_GROUP_ID]: {
          [databaseId]: {
            [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
          },
        },
      });
    });

    H.activateToken("bleeding-edge");

    cy.get<Table>("@sqliteTable").then(({ id, schema }) => {
      expect(schema).to.equal("");

      cy.request("PUT", `/api/apps/${DATA_APP_NAME}/table-dependencies`, {
        table_ids: [id],
      });
    });

    cy.get<number>("@dataAppGroupId").then((groupId) => {
      H.addUserToGroup(groupId, USERS.nodata.email);
    });

    cy.visit(`/admin/settings/apps/${DATA_APP_NAME}/users`);
    userRow(USERS.nodata.email)
      .findByRole("button", { name: "Missing data access" })
      .should("be.visible")
      .realHover();

    cy.get<Table>("@sqliteTable").then(({ id, db_id }) => {
      cy.findByTestId("missing-tables-list").within(() => {
        cy.findAllByRole("link").should("have.length", 2);

        cy.findByRole("link", { name: "sqlite" }).should(
          "have.attr",
          "href",
          `/admin/permissions/data/database/${db_id}`,
        );

        cy.findByRole("link", { name: "Number With Nulls" })
          .should(
            "have.attr",
            "href",
            `/admin/permissions/data/database/${db_id}/table/${id}`,
          )
          .and("have.attr", "target", "_blank")
          .and("have.attr", "rel", "noopener noreferrer")
          .invoke("removeAttr", "target")
          .click();
      });

      cy.location("pathname").should(
        "eq",
        `/admin/permissions/data/database/${db_id}/table/${id}`,
      );
    });

    cy.findByTestId("permissions-editor-breadcrumbs").should(
      "contain.text",
      "Number With Nulls",
    );

    H.assertPermissionForItem("All Users", 0, "Blocked");
  });

  it("shows warnings only for users missing access to used tables", () => {
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

  describe("signed-out visitors", () => {
    beforeEach(() => {
      H.setupGitSync();
      H.copySyncedCollectionFixture();
      H.copySyncedDataAppsFixture();
      cy.task("writeDataAppFiles", {
        files: {
          [`${H.LOCAL_GIT_PATH}/data_apps/${SYNCED_APP_SLUG}/data_app.yaml`]: [
            "name: Good App",
            "path: ./index.js",
            "allowed_hosts:",
            `  - ${ALLOWED_HOST}`,
            "",
          ].join("\n"),
        },
      });
      H.commitToRepo("Add a data app with an allowed host");
      H.configureGitAndPullChanges("read-write");

      cy.request(`/embed/apps/${SYNCED_APP_SLUG}`).then((res) => {
        expect(String(res.headers["content-security-policy"])).to.contain(
          ALLOWED_HOST,
        );
      });

      cy.signOut();
    });

    it("does not serve the iframe document or its allowed hosts", () => {
      cy.request({
        url: `/embed/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
        followRedirect: false,
      }).then((res) => {
        expect(res.status).to.eq(302);
        expect(String(res.headers["location"])).to.contain("/auth/login");
        expect(
          String(res.headers["content-security-policy"] ?? ""),
        ).not.to.contain(ALLOWED_HOST);
      });
    });

    it("does not put the allowed hosts on the top-level app page", () => {
      cy.request({
        url: `/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
        followRedirect: false,
      }).then((res) => {
        // The SPA shell is still served; the React app sends the visitor to
        // login. Anchor on it so a 404 or an empty response can't pass the
        // negative check below.
        expect(res.status).to.eq(200);
        expect(String(res.headers["content-type"])).to.contain("text/html");
        expect(res.headers["content-security-policy"]).to.be.a("string");
        expect(res.headers["content-security-policy"]).not.to.contain(
          ALLOWED_HOST,
        );
      });
    });

    it("refuses the bundle and app metadata", () => {
      cy.request({
        url: `/api/apps/${SYNCED_APP_SLUG}/bundle`,
        failOnStatusCode: false,
      }).then((res) => {
        expect(res.status).to.eq(401);
        expect(res.headers).not.to.have.property(
          "x-metabase-data-app-allowed-hosts",
        );
      });

      cy.request({
        url: `/api/apps/${SYNCED_APP_SLUG}`,
        failOnStatusCode: false,
      })
        .its("status")
        .should("eq", 401);
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
