import { COLLECTION_GROUP_ID } from "e2e/support/cypress_sample_instance_data";
import type { DataApp } from "metabase-types/api";

const { H } = cy;

const APP_NAME = "group-access-test";

describe("scenarios > data apps > group access (EMB-2385)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.request("POST", `/api/apps/${APP_NAME}/draft`);
    cy.request("GET", `/api/permissions/group/${COLLECTION_GROUP_ID}`)
      .its("body.name")
      .as("groupName");
  });

  it("assigns and removes a group to control member discovery and access", () => {
    cy.signIn("nodata");
    cy.request<DataApp[]>("GET", "/api/apps")
      .its("body")
      .should("deep.equal", []);
    cy.request({ url: `/api/apps/${APP_NAME}`, failOnStatusCode: false })
      .its("status")
      .should("eq", 403);

    cy.signInAsAdmin();
    cy.visit("/admin/settings/apps");
    cy.findByTestId(`data-app-list-item-${APP_NAME}`)
      .findByRole("button", { name: `Actions for ${APP_NAME}` })
      .click();
    H.popover().findByRole("menuitem", { name: "Manage group access" }).click();
    cy.location("pathname").should(
      "eq",
      `/admin/settings/apps/${APP_NAME}/groups`,
    );
    H.main().findByText("No groups have access yet").should("be.visible");

    cy.findByRole("button", { name: "Add groups" }).click();
    cy.findByRole("textbox", { name: "Search for groups to add" }).click();
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("option", { name }).click(),
    );

    cy.intercept("POST", `/api/apps/${APP_NAME}/groups`).as("assignGroups");
    cy.findByTestId("data-app-groups-card")
      .findByRole("button", { name: "Add groups" })
      .click();
    cy.wait("@assignGroups")
      .its("request.body")
      .should("deep.equal", { group_ids: [COLLECTION_GROUP_ID] });
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("button", { name: `Remove ${name}` }).should("be.visible"),
    );

    cy.log("The assigned group grants its existing members access");
    cy.signIn("nodata");
    cy.request<DataApp[]>("GET", "/api/apps")
      .its("body")
      .should("deep.equal", [{ name: APP_NAME, display_name: APP_NAME }]);
    cy.request("GET", `/api/apps/${APP_NAME}`).its("status").should("eq", 200);

    cy.log(
      "Removing the assignment revokes member access and preserves admin access",
    );
    cy.signInAsAdmin();
    cy.visit(`/admin/settings/apps/${APP_NAME}/groups`);
    cy.intercept(
      "DELETE",
      `/api/apps/${APP_NAME}/groups/${COLLECTION_GROUP_ID}`,
    ).as("removeGroup");
    cy.get<string>("@groupName").then((name) =>
      cy.findByRole("button", { name: `Remove ${name}` }).click(),
    );
    cy.wait("@removeGroup");
    H.main().findByText("No groups have access yet").should("be.visible");
    cy.request("GET", `/api/apps/${APP_NAME}`).its("status").should("eq", 200);

    cy.signIn("nodata");
    cy.request<DataApp[]>("GET", "/api/apps")
      .its("body")
      .should("deep.equal", []);
    cy.request({ url: `/api/apps/${APP_NAME}/bundle`, failOnStatusCode: false })
      .its("status")
      .should("eq", 403);
  });
});
