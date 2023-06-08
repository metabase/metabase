import { restore, visitQuestion } from "e2e/support/helpers";

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

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "42";

const PUBLIC_URL_REGEX = /\/public\/(question|dashboard)\/[0-9a-f-]+$/;

const USERS = {
  "admin user": () => cy.signInAsAdmin(),
  "user with no permissions": () => cy.signIn("none"),
  "anonymous user": () => cy.signOut(),
};

describe("scenarios > public", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

    // setup parameterized question
    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.wrap(id).as("questionId");
      visitQuestion(id);
    });
  });

  describe("questions", () => {
    // Note: Test suite is sequential, so individual test cases can't be run individually
    it("should allow users to create public questions", () => {
      cy.icon("share").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Enable sharing")
        .parent()
        .find("input[type=checkbox]")
        .check();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Public link")
        .parent()
        .find("input")
        .should($input => {
          expect($input.val()).to.match(PUBLIC_URL_REGEX);
        });
    });

    Object.entries(USERS).map(([userType, setUser]) =>
      describe(`${userType}`, () => {
        it(`should be able to view public questions`, () => {
          cy.get("@questionId").then(id => {
            cy.request("POST", `/api/card/${id}/public_link`).then(
              ({ body: { uuid } }) => {
                setUser();
                cy.visit({
                  url: `/public/question/${uuid}`,
                });
              },
            );
          });

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.contains(COUNT_ALL);

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.contains("Category").click();
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.contains("Doohickey").click();
          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.contains("Add filter").click();

          // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
          cy.contains(COUNT_DOOHICKEY);
        });
      }),
    );
  });
});
