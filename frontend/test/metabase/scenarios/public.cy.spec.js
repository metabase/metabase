import {
  signInAsAdmin,
  signIn,
  signOut,
  restore,
  popover,
  modal,
} from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/metadata";

const COUNT_ALL = "200";
const COUNT_DOOHICKEY = "42";

const PUBLIC_URL_REGEX = /\/public\/(question|dashboard)\/[0-9a-f-]+$/;

const USERS = {
  "admin user": () => signInAsAdmin(),
  "user with no permissions": () => signIn("none"),
  "anonymous user": () => signOut(),
};

describe("public and embeds", () => {
  before(restore);

  beforeEach(() => {
    signInAsAdmin();
    cy.server();
  });

  let questionId;
  let questionPublicLink;
  let questionEmbedUrl;
  let dashboardId;
  let dashboardPublicLink;
  let dashboardEmbedUrl;

  describe("questions", () => {
    // Note: Test suite is sequential, so individual test cases can't be run individually
    it("should allow users to create parameterized SQL questions", () => {
      cy.visit(`/question/new?type=native&database=${SAMPLE_DATASET.id}`);
      cy.get(".ace_text-input").type(
        "select count(*) from products where {{c}}",
        {
          force: true,
          parseSpecialCharSequences: false,
        },
      );

      // HACK: disable the editor due to weirdness with `.type()` on other elements typing into editor
      cy.window().then(win => {
        win.document.querySelectorAll(".ace_text-input")[0].disabled = true;
      });

      cy.contains("Filter widget label")
        .siblings("input")
        .type("Category");

      cy.contains("Text").click();
      popover()
        .contains("Field Filter")
        .click();

      popover()
        .contains("Products")
        .click();
      popover()
        .contains("Category")
        .click();

      cy.get(".Icon-play")
        .first()
        .click();
      cy.contains(COUNT_ALL);

      cy.contains("Category").click();
      popover()
        .contains("Doohickey")
        .click();
      popover()
        .contains("Add filter")
        .click();

      cy.get(".Icon-play")
        .first()
        .click();
      cy.contains(COUNT_DOOHICKEY);

      cy.focused().blur();

      // This is needed to work around a timing bug. Without closing the editor,
      // part of the question name was getting entered into the ace editor.
      cy.get(".Icon-contract").click();

      cy.contains("Save").click();
      modal()
        .find('input[name="name"]')
        .focus()
        .type("sql param");
      modal()
        .contains("button", "Save")
        .should("not.be.disabled")
        .click();

      modal()
        .contains("Not now")
        .click();

      cy.url()
        .should("match", /\/question\/\d+\?c=Doohickey$/)
        .then(url => {
          questionId = parseInt(url.match(/question\/(\d+)/)[1]);
        });
    });

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
        .then($input => {
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
        .then($input => {
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
