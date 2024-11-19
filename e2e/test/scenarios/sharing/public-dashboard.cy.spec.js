import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  assertDashboardFixedWidth,
  assertDashboardFullWidth,
  createDashboardWithQuestions,
  createPublicDashboardLink,
  dashboardParametersContainer,
  describeEE,
  filterWidget,
  getDashboardCard,
  goToTab,
  openNewPublicLinkDropdown,
  openSharingMenu,
  popover,
  restore,
  setTokenFeatures,
  updateSetting,
  visitDashboard,
  visitPublicDashboard,
} from "e2e/support/helpers";

const { PRODUCTS, ORDERS_ID } = SAMPLE_DATABASE;

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
  updateSetting("enable-public-sharing", true);

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
      cy.findByTestId("public-link-input").should(
        "not.have.attr",
        "placeholder",
        "Loading…",
      );
      cy.findByTestId("public-link-input").should($input => {
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
      openSharingMenu("Public link");

      cy.findByTestId("public-link-popover-content").within(() => {
        cy.findByText("Public link").should("be.visible");
        cy.findByTestId("public-link-input").should(
          "not.have.attr",
          "placeholder",
          "Loading…",
        );
        cy.findByTestId("public-link-input").should($input => {
          expect($input.val()).to.match(PUBLIC_DASHBOARD_REGEX);
        });
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

  it("should allow to set locale from the `locale` query parameter", () => {
    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id, {
        params: { locale: "de" },
      });
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- we don't care where the text is
    cy.findByText("Registerkarte als PDF exportieren").should("be.visible");
    cy.url().should("include", "locale=de");
  });

  it("should respect click behavior", () => {
    createDashboardWithQuestions({
      dashboardName: "test click behavior",
      questions: [
        {
          name: "orders",
          query: {
            "source-table": ORDERS_ID,
            limit: 5,
          },
        },
      ],
      cards: [
        {
          visualization_settings: {
            column_settings: {
              '["name","TOTAL"]': {
                click_behavior: {
                  type: "link",
                  linkType: "url",
                  linkTemplate: "https://metabase.com",
                },
              },
            },
          },
        },
      ],
    }).then(({ dashboard }) => {
      visitPublicDashboard(dashboard.id);
    });

    // This is a hacky way to intercept the link click we create an a element
    // with href on fly and remove it afterwards in lib/dom.js
    cy.window().then(win => {
      cy.spy(win.document.body, "appendChild").as("appendChild");
    });

    getDashboardCard().findByText("39.72").click();

    cy.get("@appendChild").then(appendChild => {
      // last call is a link
      const element = appendChild.lastCall.args[0];

      expect(element.tagName).to.eq("A");
      expect(element.href).to.eq("https://metabase.com/");
    });
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
    updateSetting("application-name", "Custom Application Name");

    cy.get("@dashboardId").then(id => {
      visitPublicDashboard(id);

      cy.title().should("eq", "Test Dashboard · Custom Application Name");
    });
  });
});
