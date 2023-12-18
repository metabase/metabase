import {
  restore,
  visitDashboard,
  visitPublicDashboard,
  filterWidget,
  popover,
  openNewPublicLinkDropdown,
  createPublicDashboardLink,
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
      cy.wrap(dashboard_id).as("dashboardId");
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
  });

  it("should allow users to create public dashboards", () => {
    cy.get("@dashboardId").then(id => {
      visitDashboard(id);
    });

    openNewPublicLinkDropdown("dashboard");

    cy.wait("@publicLink").then(({ response }) => {
      expect(response.body.uuid).not.to.be.null;

      cy.findByTestId("public-link-input").should("be.visible");
      cy.findByTestId("public-link-input").then($input => {
        expect($input.val()).to.match(PUBLIC_DASHBOARD_REGEX);
      });
    });
  });

  it("should only allow non-admin users to see a public link if one has already been created", () => {
    cy.get("@dashboardId").then(id => {
      createPublicDashboardLink(id);
      cy.signOut();
    });

    cy.signInAsNormalUser().then(() => {
      cy.get("@dashboardId").then(id => {
        visitDashboard(id);
      });

      cy.icon("share").click();

      cy.findByTestId("public-link-popover-content").within(() => {
        cy.findByText("Public link").should("be.visible");
        cy.findByTestId("public-link-input").then($input =>
          expect($input.val()).to.match(PUBLIC_DASHBOARD_REGEX),
        );
        cy.findByText("Remove public URL").should("not.exist");
      });
    });
  });

  it("should see a tooltip prompting the user to ask their admin to create a public link", () => {
    cy.signInAsNormalUser();
    cy.get("@dashboardId").then(id => {
      visitDashboard(id);
    });

    cy.findByTestId("dashboard-header").icon("share").realHover();
    cy.findByRole("tooltip").within(() => {
      cy.findByText("Ask your admin to create a public link").should(
        "be.visible",
      );
    });
  });

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it(`should be able to view public dashboards`, () => {
        cy.get("@dashboardId").then(id => {
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
    cy.get("@dashboardId").then(id => {
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
