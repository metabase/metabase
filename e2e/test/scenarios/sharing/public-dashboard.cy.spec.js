import {
  restore,
  visitDashboard,
  visitPublicDashboard,
  filterWidget,
  popover,
  createPublicLinkDropdown,
  openPublicLinkDropdown,
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

    cy.intercept("/api/dashboard/*/public_link").as("publicLink");

    cy.createNativeQuestionAndDashboard({
      questionDetails,
      dashboardDetails,
    }).then(({ body: { id, card_id, dashboard_id } }) => {
      cy.wrap(dashboard_id).as("publicDashboardId");
      // Connect filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        dashcards: [
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

    cy.createDashboard({ name: "test dashboard" }).then(
      ({ body: { id: dashboardId } }) => {
        cy.wrap(dashboardId).as("nonPublicDashboardId");
      },
    );
  });

  it("should allow users to create public dashboards", () => {
    cy.get("@publicDashboardId").then(id => {
      visitDashboard(id);
    });

    createPublicLinkDropdown("dashboard");

    cy.wait("@publicLink").then(({ response }) => {
      expect(response.body.uuid).not.to.be.null;

      cy.findByRole("heading", { name: "Public link" })
        // This click doesn't have any meaning in the context of the correctness of this test!
        // It's simply here to prevent test flakiness, which happens because the Modal overlay
        // is animating (disappearing) and we need to wait for it to stop the transition.
        // Cypress will retry clicking this text until the DOM element is "actionable", or in
        // our case - until there's no element on top of it blocking it. That's also when we
        // expect this input field to be populated with the actual value.
        .click()
        .parent()
        .findByText(/^http/)
        .then($input => {
          expect($input.text()).to.match(PUBLIC_DASHBOARD_REGEX);
        });
    });
  });

  it("should only allow non-admin users to see a public link if one has already been created", () => {
    cy.get("@publicDashboardId").then(id => {
      visitDashboard(id);
      createPublicLinkDropdown("dashboard");
      cy.signOut();
    });

    cy.signInAsNormalUser().then(() => {
      cy.get("@publicDashboardId").then(id => {
        visitDashboard(id);
      });

      openPublicLinkDropdown({ isAdmin: false });

      cy.findByTestId("public-link-popover-content").within(() => {
        cy.findByText("Public link").should("be.visible");
        cy.findByText(/^http/).should("be.visible");
        cy.findByText("Remove public URL").should("not.exist");
      });
    });
  });

  it("should not allow users to see the embed button or the public link dropdown if a link hasn't been created", () => {
    cy.signInAsNormalUser();
    cy.get("@nonPublicDashboardId").then(id => {
      visitDashboard(id);
    });

    cy.findByTestId("dashboard-header").icon("share").should("not.exist");
  });

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it(`should be able to view public dashboards`, () => {
        cy.get("@publicDashboardId").then(id => {
          cy.request("POST", `/api/dashboard/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit(`/public/dashboard/${uuid}`);
            },
          );
        });

        cy.get(".ScalarValue").should("have.text", COUNT_ALL);

        filterWidget().click();
        popover().within(() => {
          cy.findByText("Doohickey").click();
          cy.button("Add filter").click();
        });

        cy.get(".ScalarValue").should("have.text", COUNT_DOOHICKEY);
      });
    }),
  );

  it("should respect 'disable auto-apply filters' in a public dashboard", () => {
    cy.get("@publicDashboardId").then(id => {
      cy.request("PUT", `/api/dashboard/${id}`, {
        auto_apply_filters: false,
      });

      visitPublicDashboard(id);
    });

    cy.get(".ScalarValue").should("have.text", COUNT_ALL);
    cy.button("Apply").should("not.exist");

    filterWidget().click();
    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    cy.get(".ScalarValue").should("have.text", COUNT_ALL);

    cy.button("Apply").should("be.visible").click();
    cy.button("Apply").should("not.exist");
    cy.get(".ScalarValue").should("have.text", COUNT_DOOHICKEY);
  });
});
