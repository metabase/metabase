import { restore } from "e2e/support/helpers";

const total = 57;
const limit = 50;

describe("scenarios > admin > troubleshooting > tasks", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // The only reliable way to reproduce this issue is by stubing page responses!
    // All previous attempts to generate enough real tasks (more than 50)
    // resulted in flaky and unpredictable tests.
    stubPageResponses({ page: 0, alias: "first" });
    stubPageResponses({ page: 1, alias: "second" });
  });

  it("pagination should work (metabase#14636)", () => {
    cy.visit("/admin/troubleshooting/tasks");
    cy.wait("@first");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Troubleshooting logs");
    cy.findByLabelText("Previous page").as("previous");
    cy.findByLabelText("Next page").as("next");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("1 - 50");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("field values scanning");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("513");

    shouldBeDisabled("@previous");
    shouldNotBeDisabled("@next");

    cy.get("@next").click();
    cy.wait("@second");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(`51 - ${total}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("1 - 50").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("analyze");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("200");

    shouldNotBeDisabled("@previous");
    shouldBeDisabled("@next");
  });
});

function shouldNotBeDisabled(selector) {
  cy.get(selector).should("be.enabled");
}

function shouldBeDisabled(selector) {
  cy.get(selector).should("be.disabled");
}

/**
 * @param {Object} payload
 * @param {(0|1)} payload.page
 * @param {("first"|"second")} payload.alias
 */
function stubPageResponses({ page, alias }) {
  const offset = page * limit;

  cy.intercept("GET", `/api/task?limit=${limit}&offset=${offset}`, req => {
    req.reply(res => {
      res.body = {
        data: stubPageRows(page),
        limit,
        offset,
        total,
      };
    });
  }).as(alias);
}

/**
 * @typedef {Object} Row
 *
 * @param {(0|1)} page
 * @returns Row[]
 */
function stubPageRows(page) {
  // There rows details don't really matter.
  // We're generating two types of rows. One for each page.
  const tasks = ["field values scanning", "analyze"];
  const durations = [513, 200];

  /** type: {Row} */
  const row = {
    id: page + 1,
    task: tasks[page],
    db_id: 1,
    started_at: "2023-03-04T01:45:26.005475-08:00",
    ended_at: "2023-03-04T01:45:26.518597-08:00",
    duration: durations[page],
    task_details: null,
    name: `Item $page}`,
    model: "card",
  };

  const pageRows = [limit, total - limit];
  const length = pageRows[page];

  const stubbedRows = Array.from({ length }, () => row);
  return stubbedRows;
}
