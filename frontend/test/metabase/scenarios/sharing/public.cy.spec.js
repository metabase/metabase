import {
  restore,
  popover,
  modal,
  visitQuestion,
  visitDashboard,
  openQuestionActions,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "42";

const PUBLIC_URL_REGEX = /\/public\/(question|dashboard)\/[0-9a-f-]+$/;

const USERS = {
  "admin user": () => cy.signInAsAdmin(),
  "user with no permissions": () => cy.signIn("none"),
  "anonymous user": () => cy.signOut(),
};

describe("scenarios > public", () => {
  let questionId;
  before(() => {
    restore();
    cy.signInAsAdmin();

    // setup parameterized question
    cy.createNativeQuestion({
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
    }).then(({ body }) => {
      questionId = body.id;
    });
  });

  beforeEach(() => {
    cy.signInAsAdmin();
  });

  let questionPublicLink;
  let dashboardId;
  let dashboardPublicLink;

  describe("questions", () => {
    // Note: Test suite is sequential, so individual test cases can't be run individually
    it("should allow users to create parameterized dashboards", () => {
      visitQuestion(questionId);

      openQuestionActions();

      popover().within(() => {
        cy.findByText("Add to dashboard").click();
      });

      modal().contains("Create a new dashboard").click();
      modal()
        .get('input[name="name"]')
        .type("parameterized dashboard", { delay: 0 });
      modal().contains("Create").click();

      cy.icon("filter").click();

      popover().within(() => {
        cy.findByText("Text or Category").click();
        cy.findByText("Dropdown").click();
      });

      cy.contains("Select…").click();
      popover().contains("Category").click();

      cy.contains("Done").click();
      cy.contains("Save").click();
      cy.findByText("You're editing this dashboard.").should("not.exist");

      cy.contains(COUNT_ALL);
      cy.contains("Text")
        .parent()
        .parent()
        .find("fieldset")
        .should("not.exist");

      cy.findByText("Text").click();

      popover().within(() => {
        cy.findByText("Doohickey").click();
      });
      cy.contains("Add filter").click();
      cy.contains(COUNT_DOOHICKEY);

      cy.url()
        .should("match", /\/dashboard\/\d+[-\w]+\?text=Doohickey$/)
        .then(url => {
          dashboardId = parseInt(url.match(/dashboard\/(\d+)/)[1]);
        });
    });

    it("should allow users to create public questions", () => {
      cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

      visitQuestion(questionId);

      cy.icon("share").click();

      cy.contains("Enable sharing")
        .parent()
        .find("input[type=checkbox]")
        .check();

      cy.contains("Public link")
        .parent()
        .find("input")
        .should($input => {
          expect($input[0].value).to.match(PUBLIC_URL_REGEX);
          questionPublicLink = $input[0].value.match(PUBLIC_URL_REGEX)[0];
        });
    });

    it("should allow users to create public dashboards", () => {
      cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

      visitDashboard(dashboardId);

      cy.icon("share").click();

      cy.contains("Enable sharing")
        .parent()
        .find("input[type=checkbox]")
        .check();

      cy.contains("Public link")
        .parent()
        .find("input")
        .should($input => {
          expect($input[0].value).to.match(PUBLIC_URL_REGEX);
          dashboardPublicLink = $input[0].value.match(PUBLIC_URL_REGEX)[0];
        });
    });

    it("should show shared questions and dashboards in admin settings", () => {
      cy.visit("/admin/settings/public-sharing");

      cy.findByText("Enable Public Sharing").should("be.visible");

      cy.findByText(
        "Enable admins to create publicly viewable links (and embeddable iframes) for Questions and Dashboards.",
      ).should("be.visible");

      // shared questions
      cy.findByText("sql param").should("be.visible");

      // shared dashboard
      cy.findByText("parameterized dashboard").should("be.visible");
    });

    Object.entries(USERS).map(([userType, setUser]) =>
      describe(`${userType}`, () => {
        beforeEach(setUser);

        it(`should be able to view public questions`, () => {
          cy.visit(questionPublicLink);
          cy.contains(COUNT_ALL);

          cy.contains("Category").click();
          cy.contains("Doohickey").click();
          cy.contains("Add filter").click();

          cy.contains(COUNT_DOOHICKEY);
        });

        it(`should be able to view public dashboards`, () => {
          cy.visit(dashboardPublicLink);
          cy.contains(COUNT_ALL);

          cy.contains("Text").click();
          cy.contains("Doohickey").click();
          cy.contains("Add filter").click();

          cy.contains(COUNT_DOOHICKEY);

          // Enter full-screen button
          cy.icon("expand");
        });
      }),
    );
  });

  describe("public dashboard with parameters linked to a custom field (metabase#25473)", () => {
    it("should show text parameter in public dashboards", () => {
      // Setup
      const customField = {
        name: "email_name",
        // Custom field is `concat([Email], [Name])`
        definition: [
          "concat",
          ["field", PEOPLE.EMAIL, null],
          ["field", PEOPLE.NAME, null],
        ],
      };
      const questionDetails = {
        name: "Question",
        query: {
          "source-table": PEOPLE_ID,
          expressions: {
            [customField.name]: customField.definition,
          },
        },
      };
      const textContainsFilter = {
        id: "890abcde",
        name: "Text contains",
        slug: "text_contains",
        type: "string/contains",
      };
      const dashboardDetails = {
        parameters: [textContainsFilter],
      };

      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: { id, card_id, dashboard_id } }) => {
        cy.wrap(dashboard_id).as("dashboardId");

        mapParameters({
          id,
          card_id,
          dashboard_id,
          parameter: textContainsFilter,
          customFieldName: customField.name,
        });
      });

      cy.get("@dashboardId").then(dashboardId => {
        visitDashboard(dashboardId);
      });

      // Enable public sharing
      cy.icon("share").click();

      cy.findByText("Enable sharing")
        .parent()
        .find("input[type=checkbox]")
        .check();

      cy.contains("Public link")
        .parent()
        .find("input")
        .then($input => {
          const dashboardPublicLink = $input[0].value;
          cy.visit(dashboardPublicLink);
        });

      // Assert public dashboard
      setFilter(textContainsFilter, "khalid-pouros@yahoo.com");
      cy.findAllByText("khalid-pouros@yahoo.com").should("have.length", 2); // 1 for the filter and 1 for the result in the card

      clearFilter();
      setFilter(textContainsFilter, "Edgardo Hackett");
      cy.findAllByText("Edgardo Hackett").should("have.length", 2); // 1 for the filter and 1 for the result in the card

      // search by the full value of the custom field which is email + name
      clearFilter();
      setFilter(textContainsFilter, "walsh-desiree@gmail.comDesiree Walsh");
      cy.findByText("walsh-desiree@gmail.com").should("be.visible");
      cy.findByText("Desiree Walsh").should("be.visible");
    });
  });
});

function mapParameters({
  id,
  card_id,
  dashboard_id,
  parameter,
  customFieldName,
} = {}) {
  return cy.request("PUT", `/api/dashboard/${dashboard_id}/cards`, {
    cards: [
      {
        id,
        card_id,
        row: 0,
        col: 0,
        size_x: 18,
        size_y: 6,
        series: [],
        visualization_settings: {},
        parameter_mappings: [
          {
            card_id,
            parameter_id: parameter.id,
            target: ["dimension", ["expression", customFieldName]],
          },
        ],
      },
    ],
  });
}

function clearFilter() {
  cy.icon("close").click();
}

function setFilter(filter, value) {
  cy.findByText(filter.name).click();

  cy.findByPlaceholderText("Enter some text").should("be.visible").type(value);

  cy.findByRole("button", {
    name: "Add filter",
  }).click();
}
