import {
  signInAsAdmin,
  signIn,
  signOut,
  restore,
  popover,
  modal,
  withSampleDataset,
} from "__support__/cypress";

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "42";

const PUBLIC_URL_REGEX = /\/public\/(question|dashboard)\/[0-9a-f-]+$/;

const USERS = {
  "admin user": () => signInAsAdmin(),
  "user with no permissions": () => signIn("none"),
  "anonymous user": () => signOut(),
};

describe("scenarios > public", () => {
  let questionId;
  before(() => {
    restore();
    signInAsAdmin();

    // setup parameterized question
    withSampleDataset(({ PRODUCTS }) =>
      cy
        .request("POST", "/api/card", {
          name: "sql param",
          dataset_query: {
            type: "native",
            native: {
              query: "select count(*) from products where {{c}}",
              "template-tags": {
                c: {
                  id: "e126f242-fbaa-1feb-7331-21ac59f021cc",
                  name: "c",
                  "display-name": "Category",
                  type: "dimension",
                  dimension: ["field-id", PRODUCTS.CATEGORY],
                  default: null,
                  "widget-type": "category",
                },
              },
            },
            database: 1,
          },
          display: "scalar",
          visualization_settings: {},
        })
        .then(({ body }) => {
          questionId = body.id;
        }),
    );
  });

  beforeEach(() => {
    signInAsAdmin();
    cy.server();
  });

  let questionPublicLink;
  let questionEmbedUrl;
  let dashboardId;
  let dashboardPublicLink;
  let dashboardEmbedUrl;

  describe("questions", () => {
    // Note: Test suite is sequential, so individual test cases can't be run individually
    it("should allow users to create parameterized dashboards", () => {
      cy.visit(`/question/${questionId}`);

      cy.get(".Icon-pencil").click();
      popover()
        .contains("Add to dashboard")
        .click();
      modal()
        .contains("Create a new dashboard")
        .click();
      modal()
        .get('input[name="name"]')
        .type("parameterized dashboard");
      modal()
        .contains("Create")
        .click();

      cy.get(".Icon-funnel_add").click();

      popover()
        .contains("Other Categories")
        .click();
      cy.contains("Select…").click();
      popover()
        .contains("Category")
        .click();

      cy.contains("Done").click();
      cy.contains("Save").click();

      cy.contains(COUNT_ALL);
      cy.contains("Category")
        .parent()
        .parent()
        .find("fieldset")
        .should("not.exist");

      cy.contains("Category").click();
      cy.focused().type("Doohickey");
      cy.contains("Add filter").click();
      cy.contains(COUNT_DOOHICKEY);

      cy.url()
        .should("match", /\/dashboard\/\d+\?category=Doohickey$/)
        .then(url => {
          dashboardId = parseInt(url.match(/dashboard\/(\d+)/)[1]);
        });
    });

    it("should allow users to create public questions", () => {
      cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

      cy.visit(`/question/${questionId}`);

      cy.get(".Icon-share").click();

      cy.contains("Enable sharing")
        .parent()
        .find("a")
        .click();

      cy.contains("Public link")
        .parent()
        .find("input")
        .should($input => {
          expect($input[0].value).to.match(PUBLIC_URL_REGEX);
          questionPublicLink = $input[0].value.match(PUBLIC_URL_REGEX)[0];
        });
    });

    it("should allow users to create embedded questions", () => {
      cy.request("PUT", "/api/setting/enable-embedding", { value: true });
      cy.request("PUT", "/api/setting/site-url", {
        value: "http://localhost:4000/", // Cypress.config().baseUrl
      });

      cy.visit(`/question/${questionId}`);

      cy.get(".Icon-share").click();

      cy.contains(".cursor-pointer", "Embed this question")
        .should("not.be.disabled")
        .click();
      cy.contains("Disabled").click();
      cy.contains("Editable").click();

      cy.contains("Publish").click();

      cy.get("iframe").then($iframe => {
        questionEmbedUrl = $iframe[0].src;
      });
    });

    it("should allow users to create public dashboards", () => {
      cy.request("PUT", "/api/setting/enable-public-sharing", { value: true });

      cy.visit(`/dashboard/${dashboardId}`);

      cy.get(".Icon-share").click();

      cy.contains("Enable sharing")
        .parent()
        .find("a")
        .click();

      cy.contains("Public link")
        .parent()
        .find("input")
        .should($input => {
          expect($input[0].value).to.match(PUBLIC_URL_REGEX);
          dashboardPublicLink = $input[0].value.match(PUBLIC_URL_REGEX)[0];
        });
    });

    it("should allow users to create embedded dashboards", () => {
      cy.request("PUT", "/api/setting/enable-embedding", { value: true });
      cy.request("PUT", "/api/setting/site-url", {
        value: "http://localhost:4000/", // Cypress.config().baseUrl
      });

      cy.visit(`/dashboard/${dashboardId}`);

      cy.get(".Icon-share").click();

      cy.contains(".cursor-pointer", "Embed this dashboard")
        .should("not.be.disabled")
        .click();
      cy.contains("Disabled").click();
      cy.contains("Editable").click();

      cy.contains("Publish").click();

      cy.get("iframe").then($iframe => {
        dashboardEmbedUrl = $iframe[0].src;
      });
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

        it(`should be able to view embedded questions`, () => {
          cy.visit(questionEmbedUrl);
          cy.contains(COUNT_ALL);

          cy.contains("Category").click();
          cy.contains("Doohickey").click();
          cy.contains("Add filter").click();

          cy.contains(COUNT_DOOHICKEY);
        });

        it(`should be able to view public dashboards`, () => {
          cy.visit(dashboardPublicLink);
          cy.contains(COUNT_ALL);

          cy.contains("Category").click();
          cy.contains("Doohickey").click();
          cy.contains("Add filter").click();

          cy.contains(COUNT_DOOHICKEY);
        });

        it(`should be able to view embedded dashboards`, () => {
          cy.visit(dashboardEmbedUrl);
          cy.contains(COUNT_ALL);

          cy.contains("Category").click();
          cy.contains("Doohickey").click();
          cy.contains("Add filter").click();

          cy.contains(COUNT_DOOHICKEY);
        });
      }),
    );
  });
});
