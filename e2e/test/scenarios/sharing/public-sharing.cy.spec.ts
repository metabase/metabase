const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { NativeQuestionDetails } from "e2e/support/helpers";
import type { Parameter } from "metabase-types/api";

const { PEOPLE, PRODUCTS, ORDERS_ID } = SAMPLE_DATABASE;

const dashboardQuestionDetails: NativeQuestionDetails = {
  name: "sql param",
  native: {
    query: "select count(*) from products where {{c}}",
    "template-tags": {
      c: {
        id: "e126f242-fbaa-1feb-7331-21ac59f021cc",
        name: "c",
        "display-name": "Category",
        type: "dimension",
        "field-id": PRODUCTS.CATEGORY,
        default: null,
        "widget-type": "category",
      },
    },
  },
  display: "scalar",
};

const textFilter: Parameter = {
  id: "1",
  type: "string/=",
  name: "Text",
  slug: "text",
  sectionId: "string",
};

const unusedFilter: Parameter = {
  id: "2",
  type: "number/=",
  name: "Number",
  slug: "number",
  sectionId: "number",
};

const dashboardDetails = {
  parameters: [textFilter, unusedFilter],
  tabs: [
    { id: 1, name: "Tab 1" },
    { id: 2, name: "Tab 2" },
  ],
};

const QUESTION_NAME = "Public question";

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "42";

const DASHBOARD_USERS = {
  "admin user": () => cy.signInAsAdmin(),
  "user with no permissions": () => cy.signIn("none"),
  "anonymous user": () => cy.signOut(),
};

const prepareDashboard = () => {
  H.createNativeQuestionAndDashboard({
    questionDetails: dashboardQuestionDetails,
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

  Object.entries(DASHBOARD_USERS).forEach(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it("should be able to view public dashboards", () => {
        cy.get<number>("@dashboardId").then((id) => {
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

  it("should default to a fixed width, respect a full width dashboard, and support #theme=dark (metabase#65731)", () => {
    cy.get<number>("@dashboardId").then((id) => {
      H.visitPublicDashboard(id);

      // new dashboards should default to 'fixed' width
      H.assertDashboardFixedWidth();

      cy.request("PUT", `/api/dashboard/${id}`, { width: "full" });
      H.visitPublicDashboard(id, { params: {}, hash: { theme: "dark" } });

      H.assertDashboardFullWidth();
    });

    cy.log("dark theme should have white text");
    cy.findByRole("heading", { name: "Test Dashboard" }).should(
      "have.css",
      "color",
      "rgba(255, 255, 255, 0.95)",
    );
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
      H.createPublicDashboardLink(dashboard.id).then(({ body: { uuid } }) => {
        cy.signOut();
        cy.visit(`/public/dashboard/${uuid}`);
      });
    });

    // This is a hacky way to intercept the link click we create an a element
    // with href on fly and remove it afterwards in lib/dom.js
    cy.window().then((win) => {
      cy.spy(win.document.body, "appendChild").as("appendChild");
    });

    H.getDashboardCard().findByText("39.72").click();

    cy.get<sinon.SinonSpy>("@appendChild").then((appendChild) => {
      // last call is a link
      const element: HTMLAnchorElement = appendChild.lastCall.args[0];

      expect(element.tagName).to.eq("A");
      expect(element.href).to.eq("https://metabase.com/");
    });
  });
});

describe("scenarios [EE] > public > dashboard", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    prepareDashboard();

    H.activateToken("pro-self-hosted");
  });

  // The settings request is sent by the app entry point while it boots, which the unit tests do not run
  it("should handle /api/session/properties incorrect response (metabase#62501)", () => {
    cy.intercept("/api/session/properties", {
      statusCode: 200,
      headers: {},
      body: "<html><body><h1>Those aren't the droids you're looking for</h1></body></html>",
    });

    cy.get<number>("@dashboardId").then((id) => H.visitPublicDashboard(id));

    cy.findByTestId("embed-frame").within(() => {
      cy.findByText("Test Dashboard").should("exist");
    });
  });
});

const questionData: NativeQuestionDetails = {
  name: "Parameterized Public Question",
  native: {
    query: "SELECT * FROM PEOPLE WHERE {{birthdate}} AND {{source}} limit 5",
    "template-tags": {
      birthdate: {
        id: "08c5ea9d-1579-3503-37f1-cbe4d29e6a28",
        name: "birthdate",
        "display-name": "Birthdate",
        type: "dimension",
        "field-id": PEOPLE.BIRTH_DATE,
        "widget-type": "date/all-options",
        default: "past30years",
      },
      source: {
        id: "37eb6fa2-3677-91d3-6be0-c5dd9113c672",
        name: "source",
        "display-name": "Source",
        type: "dimension",
        "field-id": PEOPLE.SOURCE,
        "widget-type": "string/=",
        default: "Affiliate",
      },
    },
  },
};

const PUBLIC_QUESTION_REGEX =
  /\/public\/question\/[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

const QUESTION_USERS = {
  "admin user": () => cy.signInAsAdmin(),
  "user with no permissions": () => cy.signIn("none"),
};

describe("scenarios > public > question", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/public/card/*/query?*").as("publicQuery");

    H.restore();
    cy.signInAsAdmin();
  });

  it("adds filters to url as get params and renders the results correctly (metabase#7120, metabase#17033, metabase#21993)", () => {
    H.createNativeQuestion(questionData).then(({ body: { id } }) => {
      H.visitQuestion(id);

      // Make sure metadata fully loaded before we continue
      cy.findByTestId("visualization-root").should("be.visible");

      H.openNewPublicLinkDropdown("card");

      // Although we already have API helper `visitPublicQuestion`,
      // it makes sense to use the UI here in order to check that the
      // generated url originally doesn't include query params
      visitPublicURL();

      // On page load, query params are added
      cy.location("search").should("include", "source=Affiliate");
      cy.location("search").should("include", "birthdate=past30years");

      H.filterWidget().contains("Previous 30 years");
      H.filterWidget().contains("Affiliate");

      cy.wait("@publicQuery");

      cy.findAllByTestId("cell-data").should("contain.text", "Affiliate");

      // Make sure we can download the public question (metabase#21993)
      cy.get<string>("@uuid").then((publicUuid) => {
        H.main().realHover();

        H.downloadAndAssert({
          fileType: "xlsx",
          questionId: id,
          publicUuid,
          isDashboard: false,
        });
      });
    });
  });

  Object.entries(QUESTION_USERS).forEach(([userType, setUser]) =>
    describe(`${userType}`, () => {
      it("should be able to view public questions", () => {
        H.createNativeQuestion(questionData).then(({ body: { id } }) => {
          cy.request("POST", `/api/card/${id}/public_link`).then(
            ({ body: { uuid } }) => {
              setUser();
              cy.visit(`/public/question/${uuid}`);

              cy.location("search").should("include", "source=Affiliate");
              cy.location("search").should("include", "birthdate=past30years");

              H.filterWidget().contains("Previous 30 years");
              H.filterWidget().contains("Affiliate");

              cy.findByTestId("visualization-root").should("be.visible");
            },
          );
        });
      });
    }),
  );

  it("should be able to view public questions with snippets and card template tags", () => {
    H.createNativeQuestion({
      name: "Nested Question",
      native: {
        query: "SELECT * FROM PEOPLE LIMIT 5",
      },
    }).then(({ body: { id: nestedQuestionId } }) => {
      H.startNewNativeQuestion({ query: "", display: "table" });

      // Create a snippet
      cy.icon("snippet").click();
      cy.findByTestId("sidebar-content").findByText("Create snippet").click();

      H.modal().within(() => {
        cy.findByLabelText(
          "Enter some SQL here so you can reuse it later",
        ).type("'test'");
        cy.findByLabelText("Give your snippet a name").type("string 'test'");
        cy.findByText("Save").click();
      });

      H.NativeEditor.type("{moveToStart}select ");
      H.NativeEditor.type(`{moveToEnd}, * from {{#${nestedQuestionId}`);

      H.saveQuestion(
        "test question",
        { wrapId: true },
        {
          path: ["Our analytics"],
        },
      );
    });

    cy.get<number>("@questionId").then((id) => {
      H.createPublicQuestionLink(id).then(({ body: { uuid } }) => {
        cy.signOut();
        cy.signInAsNormalUser();
        cy.visit(`/public/question/${uuid}`);
        cy.get("[data-testid=cell-data]").contains("test");
        // Check the name of the first person in the PEOPLE table
        cy.get("[data-testid=cell-data]").contains("Hudson Borer");
      });
    });
  });
  it("should support #theme=dark (metabase#65731)", () => {
    const questionName = "Orders Theme Test";
    H.createQuestion({
      name: questionName,
      query: {
        "source-table": ORDERS_ID,
      },
    }).then(({ body: { id } }) => {
      H.visitPublicQuestion(id, {
        params: {},
        hash: {
          theme: "dark",
        },
      });
    });

    cy.log("dark theme should have white text");
    cy.findByRole("heading", {
      name: questionName,
    }).should("have.css", "color", "rgba(255, 255, 255, 0.95)");
  });
});

const visitPublicURL = () => {
  cy.findByTestId("public-link-input").should(($input) => {
    // Copied URL has no get params
    expect($input.val()).to.match(PUBLIC_QUESTION_REGEX);
  });
  cy.findByTestId("public-link-input")
    .invoke("val")
    .then((publicURL) => {
      cy.signOut();
      cy.visit(String(publicURL));
    });
};

describe("scenarios > admin > settings > public sharing", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/card/public").as("getPublicQuestions");
    cy.intercept("DELETE", "/api/card/*/public_link").as("revokePublicLink");
    cy.intercept("GET", "/api/public/card/*").as("getPublicCard");
  });

  it("should open a public question link from the admin settings, revoke it, and stop serving it", () => {
    H.createQuestion({
      name: QUESTION_NAME,
      query: { "source-table": ORDERS_ID },
    }).then(({ body: { id } }) => {
      cy.request<{ uuid: string }>("POST", `/api/card/${id}/public_link`).then(
        ({ body: { uuid } }) => {
          cy.wrap(`/public/question/${uuid}`).as("publicPath");
        },
      );
    });

    cy.visit("/admin/settings/public-sharing");
    cy.wait("@getPublicQuestions");
    cy.findByTestId("admin-layout-content")
      .findByText("Shared questions")
      .should("be.visible");

    cy.get<string>("@publicPath").then((publicPath) => {
      cy.findByTestId("admin-layout-content")
        .findByText(`${location.origin}${publicPath}`)
        .click();
      cy.url().should("eq", `${location.origin}${publicPath}`);
      cy.wait("@getPublicCard").its("response.statusCode").should("eq", 200);
      cy.findByRole("heading", { name: QUESTION_NAME }).should("be.visible");
    });

    cy.visit("/admin/settings/public-sharing");
    cy.wait("@getPublicQuestions");
    cy.findByTestId("admin-layout-content")
      .findByText(QUESTION_NAME)
      .closest("tr")
      .findByRole("button", { name: "Revoke link" })
      .click();
    H.modal().within(() => {
      cy.findByText("Disable this link?").should("be.visible");
      cy.button("Yes").click();
    });
    cy.wait("@revokePublicLink").its("response.statusCode").should("eq", 204);
    cy.findByTestId("admin-layout-content")
      .findByText("No questions have been publicly shared yet.")
      .should("be.visible");

    cy.log("the revoked link stays gone after a reload");
    cy.reload();
    cy.wait("@getPublicQuestions");
    cy.findByTestId("admin-layout-content")
      .findByText("No questions have been publicly shared yet.")
      .should("be.visible");
    cy.findByTestId("admin-layout-content")
      .findByText(QUESTION_NAME)
      .should("not.exist");

    cy.log("the public URL stops working");
    // A fresh alias, so the wait cannot pick up a request from the first visit
    cy.intercept("GET", "/api/public/card/*").as("getRevokedPublicCard");
    cy.get<string>("@publicPath").then((publicPath) => {
      cy.visit(publicPath);
    });
    cy.wait("@getRevokedPublicCard")
      .its("response.statusCode")
      .should("eq", 404);
    cy.findByTestId("embed-frame").findByText("Not found").should("be.visible");
    cy.findByRole("heading", { name: QUESTION_NAME }).should("not.exist");
  });
});
