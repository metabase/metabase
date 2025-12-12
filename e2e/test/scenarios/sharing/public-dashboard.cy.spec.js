const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
  H.updateSetting("enable-public-sharing", true);

  cy.intercept("/api/dashboard/*/public_link").as("publicLink");

  H.createNativeQuestionAndDashboard({
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
    H.restore();
    cy.signInAsAdmin();

    prepareDashboard();
  });

  it("should allow users to create public dashboards", () => {
    H.visitDashboard("@dashboardId");

    H.openNewPublicLinkDropdown("dashboard");

    cy.wait("@publicLink").then(({ response }) => {
      expect(response.body.uuid).not.to.be.null;

      cy.findByTestId("public-link-input").should("be.visible");
      cy.findByTestId("public-link-input").should(
        "not.have.attr",
        "placeholder",
        "Loading…",
      );
      cy.findByTestId("public-link-input").should(($input) => {
        expect($input.val()).to.match(PUBLIC_DASHBOARD_REGEX);
      });
    });
  });

  it("should only allow non-admin users to see a public link if one has already been created", () => {
    cy.get("@dashboardId").then((id) => {
      H.createPublicDashboardLink(id);
      cy.signOut();
    });

    cy.signInAsNormalUser().then(() => {
      H.visitDashboard("@dashboardId");
      H.openSharingMenu("Public link");

      cy.findByTestId("public-link-popover-content").within(() => {
        cy.findByText("Public link").should("be.visible");
        cy.findByTestId("public-link-input").should(
          "not.have.attr",
          "placeholder",
          "Loading…",
        );
        cy.findByTestId("public-link-input").should(($input) => {
          expect($input.val()).to.match(PUBLIC_DASHBOARD_REGEX);
        });
        cy.findByText("Remove public URL").should("not.exist");
      });
    });
  });

  Object.entries(USERS).map(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it("should be able to view public dashboards", () => {
        cy.get("@dashboardId").then((id) => {
          cy.request("POST", `/api/dashboard/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit(`/public/dashboard/${uuid}`);
            },
          );
        });

        cy.findByTestId("scalar-value").should("have.text", COUNT_ALL);

        H.filterWidget().click();
        H.popover().within(() => {
          cy.findByText("Doohickey").click();
          cy.button("Add filter").click();
        });

        cy.findByTestId("scalar-value").should("have.text", COUNT_DOOHICKEY);
      });
    }),
  );

  it("should respect 'disable auto-apply filters' in a public dashboard", () => {
    cy.get("@dashboardId").then((id) => {
      cy.request("PUT", `/api/dashboard/${id}`, {
        auto_apply_filters: false,
      });

      H.visitPublicDashboard(id);
    });

    cy.findByTestId("scalar-value").should("have.text", COUNT_ALL);
    H.applyFilterToast().should("not.exist");

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    cy.findByTestId("scalar-value").should("have.text", COUNT_ALL);

    H.applyFilterButton().click();
    H.applyFilterToast().should("not.exist");
    cy.findByTestId("scalar-value").should("have.text", COUNT_DOOHICKEY);
  });

  it("should only display filters mapped to cards on the selected tab", () => {
    cy.get("@dashboardId").then((id) => {
      H.visitPublicDashboard(id);
    });

    H.dashboardParametersContainer().within(() => {
      cy.findByText(textFilter.name).should("be.visible");
      cy.findByText(unusedFilter.name).should("not.exist");
    });

    H.goToTab(tab2.name);

    H.dashboardParametersContainer().should("not.exist");
    cy.findByTestId("embed-frame").within(() => {
      cy.findByText(textFilter.name).should("not.exist");
      cy.findByText(unusedFilter.name).should("not.exist");
    });
  });

  it("should respect dashboard width setting in a public dashboard", () => {
    cy.get("@dashboardId").then((id) => {
      H.visitPublicDashboard(id);
    });

    // new dashboards should default to 'fixed' width
    H.assertDashboardFixedWidth();

    // toggle full-width
    cy.get("@dashboardId").then((id) => {
      cy.signInAsAdmin();
      cy.request("PUT", `/api/dashboard/${id}`, {
        width: "full",
      });
      H.visitPublicDashboard(id);
    });

    H.assertDashboardFullWidth();
  });

  it("should render when a filter passed with value starting from '0' (metabase#41483)", () => {
    cy.get("@dashboardId").then((id) => {
      H.visitPublicDashboard(id, {
        params: { text: "002" },
      });
    });

    cy.url().should("include", "text=002");

    H.filterWidget().findByText("002").should("be.visible");
  });

  it("should respect click behavior", () => {
    H.createDashboardWithQuestions({
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
      H.visitPublicDashboard(dashboard.id);
    });

    // This is a hacky way to intercept the link click we create an a element
    // with href on fly and remove it afterwards in lib/dom.js
    cy.window().then((win) => {
      cy.spy(win.document.body, "appendChild").as("appendChild");
    });

    H.getDashboardCard().findByText("39.72").click();

    cy.get("@appendChild").then((appendChild) => {
      // last call is a link
      const element = appendChild.lastCall.args[0];

      expect(element.tagName).to.eq("A");
      expect(element.href).to.eq("https://metabase.com/");
    });
  });

  it("should support #theme=dark (metabase#65731)", () => {
    const dashboardName = "Dashboard Theme Test";
    H.createDashboardWithQuestions({
      dashboardName,
      questions: [],
    }).then(({ dashboard }) => {
      H.visitPublicDashboard(dashboard.id, {
        hash: {
          theme: "dark",
        },
      });
    });

    cy.log("dark theme should have white text");
    cy.findByRole("heading", {
      name: dashboardName,
    }).should("have.css", "color", "rgba(255, 255, 255, 0.95)");
  });
});

describe("scenarios [EE] > public > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    prepareDashboard();

    H.activateToken("pro-self-hosted");
  });

  it("should set the window title to `{dashboard name} · {application name}`", () => {
    H.updateSetting("application-name", "Custom Application Name");

    cy.get("@dashboardId").then((id) => {
      H.visitPublicDashboard(id);

      cy.title().should("eq", "Test Dashboard · Custom Application Name");
    });
  });

  it("should allow to set locale from the `#locale` hash parameter (metabase#50182)", () => {
    // We don't have a de-CH.json file, so it should fallback to de.json, see metabase#51039 for more details
    cy.intercept("/app/locales/de.json").as("deLocale");

    cy.get("@dashboardId").then((id) => {
      H.visitPublicDashboard(id, {
        hash: { locale: "de-CH" },
      });
    });

    cy.wait("@deLocale");

    cy.findByRole("button", {
      name: "Automatische Aktualisierung",
    }).should("exist");

    cy.url().should("include", "locale=de");
  });

  it("should disable background via `#background=false` hash parameter when rendered inside an iframe (metabase#62391)", () => {
    cy.get("@dashboardId").then((id) => {
      H.visitPublicDashboard(id, {
        hash: { background: "false" },
        onBeforeLoad: (window) => {
          window.overrideIsWithinIframe = true;
        },
      });
    });

    cy.findByTestId("embed-frame").should("exist");

    cy.get("body.mb-wrapper").should(
      "have.css",
      "background-color",
      "rgba(0, 0, 0, 0)",
    );

    cy.window().then((win) => {
      delete win.overrideIsWithinIframe;
    });
  });

  it("should not disable background via `#background=false` hash parameter when rendered without an iframe", () => {
    cy.get("@dashboardId").then((id) => {
      H.visitPublicDashboard(id, {
        hash: { background: "false" },
      });
    });

    cy.findByTestId("embed-frame").should("exist");

    cy.get("body.mb-wrapper").should(
      "not.have.css",
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
  });

  it("should handle /api/session/properties incorrect response (metabase#62501)", () => {
    cy.intercept("/api/session/properties", {
      statusCode: 200,
      headers: {},
      body: "<html><body><h1>Those aren't the droids you're looking for</h1></body></html>",
    });

    cy.get("@dashboardId").then(H.visitPublicDashboard);

    cy.findByTestId("embed-frame").within(() => {
      cy.findByText("Test Dashboard").should("exist");
    });
  });
});
