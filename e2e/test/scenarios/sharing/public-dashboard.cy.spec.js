import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitDashboard,
  visitPublicDashboard,
  filterWidget,
  popover,
  openNewPublicLinkDropdown,
  createPublicDashboardLink,
  dashboardParametersContainer,
  goToTab,
  assertDashboardFixedWidth,
  assertDashboardFullWidth,
  describeEE,
  setTokenFeatures,
} from "e2e/support/helpers";

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

const textFilter = {
  id: "1",
  type: "string/=",
  name: "Text",
  slug: "text",
  sectionId: "string",
};

const unusedFilter = {
  id: "2",
  type: "number/=",
  name: "Number",
  slug: "number",
  sectionId: "number",
};

const tab1 = {
  id: 1,
  name: "Tab 1",
};

const tab2 = {
  id: 2,
  name: "Tab 2",
};

const dashboardDetails = {
  parameters: [textFilter, unusedFilter],
  tabs: [tab1, tab2],
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

const prepareDashboard = () => {
  cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

  cy.intercept("/api/dashboard/*/public_link").as("publicLink");

  cy.createNativeQuestionAndDashboard({
    questionDetails,
    dashboardDetails,
  }).then(
    ({
      body: { id, card_id, dashboard_id, dashboard_tab_id },
      dashboardTabs,
    }) => {
      cy.wrap(dashboard_id).as("dashboardId");
      // Connect filter to the card
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        tabs: dashboardTabs,
        dashcards: [
          {
            id,
            dashboard_tab_id,
            card_id,
            row: 0,
            col: 0,
            size_x: 8,
            size_y: 6,
            parameter_mappings: [
              {
                parameter_id: textFilter.id,
                card_id,
                target: ["dimension", ["template-tag", "c"]],
              },
            ],
          },
        ],
      });
    },
  );
};

describe("scenarios > public > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    prepareDashboard();
  });

  it("should allow users to create public dashboards", () => {
    visitDashboard("@dashboardId");

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
      visitDashboard("@dashboardId");

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

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it("should be able to view public dashboards", () => {
        cy.get("@dashboardId").then(id => {
          cy.request("POST", `/api/dashboard/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit(`/public/dashboard/${uuid}`);
            },
          );
        });

        cy.findByTestId("scalar-value").should("have.text", COUNT_ALL);

        filterWidget().click();
        popover().within(() => {
          cy.findByText("Doohickey").click();
          cy.button("Add filter").click();
        });

        cy.findByTestId("scalar-value").should("have.text", COUNT_DOOHICKEY);
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

    cy.findByTestId("scalar-value").should("have.text", COUNT_ALL);
    cy.button("Apply").should("not.exist");

    filterWidget().click();
    popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    cy.findByTestId("scalar-value").should("have.text", COUNT_ALL);

    cy.button("Apply").should("be.visible").click();
    cy.button("Apply").should("not.exist");
    cy.findByTestId("scalar-value").should("have.text", COUNT_DOOHICKEY);
  });

  it("should only display filters mapped to cards on the selected tab", () => {
    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id);
    });

    dashboardParametersContainer().within(() => {
      cy.findByText(textFilter.name).should("be.visible");
      cy.findByText(unusedFilter.name).should("not.exist");
    });

    goToTab(tab2.name);

    dashboardParametersContainer().should("not.exist");
    cy.findByTestId("embed-frame").within(() => {
      cy.findByText(textFilter.name).should("not.exist");
      cy.findByText(unusedFilter.name).should("not.exist");
    });
  });

  it("should respect dashboard width setting in a public dashboard", () => {
    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id);
    });

    // new dashboards should default to 'fixed' width
    assertDashboardFixedWidth();

    // toggle full-width
    cy.get("@dashboardId").then(id => {
      cy.signInAsAdmin();
      cy.request("PUT", `/api/dashboard/${id}`, {
        width: "full",
      });
      visitPublicDashboard(id);
    });

    assertDashboardFullWidth();
  });

  it("should render when a filter passed with value starting from '0' (metabase#41483)", () => {
    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id, {
        params: { text: "002" },
      });
    });

    cy.url().should("include", "text=002");

    filterWidget().findByText("002").should("be.visible");
  });
});

describeEE("scenarios [EE] > public > dashboard", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    prepareDashboard();

    setTokenFeatures("all");
  });

  it("should set the window title to `{dashboard name} · {application name}`", () => {
    cy.request("PUT", "/api/setting/application-name", {
      value: "Custom Application Name",
    });

    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id);

      cy.title().should("eq", "Test Dashboard · Custom Application Name");
    });
  });
});
