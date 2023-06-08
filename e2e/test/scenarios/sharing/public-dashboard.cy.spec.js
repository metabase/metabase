import {
  restore,
  visitDashboard,
  visitPublicDashboard,
  rightSidebar,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "sql param",
  native: {
    query: "select count(*) from products where {{c}}",
    "template-tags": {
      c: {
        id: "e126f242-fbaa-1feb-7331-21ac59f021cc",
        name: "c",
        "display-name": "Category",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        default: null,
        "widget-type": "category",
      },
    },
  },
  display: "scalar",
};

const filter = {
  name: "Text",
  slug: "text",
  id: "4f37fd0d",
  type: "string/=",
  sectionId: "string",
};

const dashboardDetails = {
  parameters: [filter],
};

const PUBLIC_DASHBOARD_REGEX =
  /\/public\/dashboard\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "42";

const USERS = {
  "admin user": () => cy.signInAsAdmin(),
  "user with no permissions": () => cy.signIn("none"),
  "anonymous user": () => cy.signOut(),
};

describe("scenarios > public > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(card_id).as("questionId");
      cy.wrap(dashboard_id).as("dashboardId");
      // Connect filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
        cards: [
          {
            id,
            card_id,
            row: 0,
            col: 0,
            size_x: 8,
            size_y: 6,
            parameter_mappings: [
              {
                parameter_id: filter.id,
                card_id,
                target: ["dimension", ["template-tag", "c"]],
              },
            ],
          },
        ],
      });
    });
  });

  it("should allow users to create public dashboards", () => {
    cy.get("@dashboardId").then(id => {
      visitDashboard(id);
    });

    cy.icon("share").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Enable sharing").siblings().click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Public link")
      .parent()
      .find("input")
      .then($input => {
        expect($input.val()).to.match(PUBLIC_DASHBOARD_REGEX);
        cy.wrap($input.val()).as("dashboardPublicLink");
      });
  });

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it(`should be able to view public dashboards`, () => {
        cy.get("@dashboardId").then(id => {
          cy.request("POST", `/api/dashboard/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit({
                url: `/public/dashboard/${uuid}`,
              });
            },
          );
        });
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(COUNT_ALL);

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("Text").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("Doohickey").click();
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains("Add filter").click();

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.contains(COUNT_DOOHICKEY);

        // Enter full-screen button
        cy.icon("expand");
      });
    }),
  );

  describe("Disable auto-apply filters", () => {
    it("should be able to view public dashboards by anonymous users", () => {
      cy.get("@dashboardId").then(id => {
        cy.intercept("PUT", `/api/dashboard/${id}`).as("editDashboard");
        visitDashboard(id);

        openDashboardSidebar();
        rightSidebar().within(() => {
          cy.findByLabelText("Auto-apply filters")
            .click()
            .should("not.be.checked");

          cy.findByText("You set auto apply filters to false.");
        });

        visitPublicDashboard(id);
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(COUNT_ALL);

      cy.button("Apply").should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Text").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Doohickey").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Add filter").click();

      cy.button("Apply").should("be.visible").click();
      cy.button("Apply").should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(COUNT_DOOHICKEY);
    });
  });
});

function openDashboardSidebar() {
  cy.get("main header").icon("info").click();
}
