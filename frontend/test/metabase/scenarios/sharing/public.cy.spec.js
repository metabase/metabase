import {
  restore,
  popover,
  modal,
  visitQuestion,
  visitDashboard,
  openQuestionActions,
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

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
});
