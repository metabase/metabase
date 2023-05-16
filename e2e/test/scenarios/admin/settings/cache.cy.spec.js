import { restore, openNativeEditor, runNativeQuery } from "e2e/support/helpers";

const nativeQuery = "select (random() * random() * random()), pg_sleep(2)";

/**
 * Disabled and quarantined until we fix the caching issues, and especially:
 * https://github.com/metabase/metabase/issues/13262
 */
describe.skip(
  "scenarios > admin > settings > cache",
  { tags: "@external" },
  () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      restore("postgres-12");
      cy.signInAsAdmin();
    });

    describe("issue 18458", () => {
      beforeEach(() => {
        cy.visit("/admin/settings/caching");

        enableCaching();

        setCachingValue("Minimum Query Duration", "1");
        setCachingValue("Cache Time-To-Live (TTL) multiplier", "2");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Saved");

        // Run the query and save the question
        openNativeEditor({ databaseName: "QA Postgres12" }).type(nativeQuery);
        runNativeQuery();

        getCellText().then(res => {
          cy.wrap(res).as("tempResult");
        });

        saveQuestion("18458");
      });

      it("should respect previously set cache duration (metabase#18458)", () => {
        refreshUntilCached();

        cy.get("@cachedResult").then(cachedValue => {
          /**
           * 5s is longer than what we set the cache to last:
           * Approx 2s for an Average Runtime x multiplier of 2.
           *
           * The cache should expire after 4s and we should see a new random result.
           */
          cy.wait(5000);

          refresh();

          getCellText().then(newValue => {
            expect(newValue).to.not.eq(cachedValue);
          });
        });
      });
    });
  },
);

function enableCaching() {
  cy.findByText("Disabled")
    .parent()
    .within(() => {
      cy.findByRole("switch").click();
    });

  cy.findByText("Enabled");
}

function setCachingValue(field, value) {
  cy.findByText(field).closest("li").find("input").type(value).blur();
}

function saveQuestion(name) {
  cy.intercept("POST", "/api/card").as("saveQuestion");

  cy.findByText("Save").click();

  cy.findByLabelText("Name").type(name);

  cy.get(".Modal").button("Save").click();

  cy.findByText("Not now").click();

  cy.wait("@saveQuestion");
}

function getCellText() {
  return cy.get(".cellData").eq(-1).invoke("text");
}

function refresh() {
  cy.icon("refresh").first().click();
  cy.wait("@cardQuery");
}

function refreshUntilCached(loop = 0) {
  if (loop > 5) {
    throw new Error("Caching mechanism seems to be broken.");
  }

  refresh();

  getCellText().then(res => {
    cy.get("@tempResult").then(temp => {
      if (res === temp) {
        cy.wrap(res).as("cachedResult");
      } else {
        cy.wrap(res).as("tempResult");

        refreshUntilCached(++loop);
      }
    });
  });
}
