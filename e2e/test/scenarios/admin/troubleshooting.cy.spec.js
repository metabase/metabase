import {
  onlyOnOSS,
  describeEE,
  restore,
  setupMetabaseCloud,
  setTokenFeatures,
  modal,
  onlyOnEE,
  main,
  appBar,
} from "e2e/support/helpers";

describe("scenarios > admin > troubleshooting > help", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // Unskip when mocking Cloud in Cypress is fixed (#18289)
  it.skip("should add the support link when running Metabase Cloud", () => {
    setupMetabaseCloud();
    cy.visit("/admin/troubleshooting/help");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase Admin");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Contact support");
  });
});

describe("scenarios > admin > troubleshooting > help", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();

    restore();
    cy.signInAsAdmin();
  });

  it("should link `Get Help` to help", () => {
    cy.visit("/admin/troubleshooting/help");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase Admin");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Get Help")
      .parents("a")
      .should("have.prop", "href")
      .and(
        "match",
        /^https:\/\/www\.metabase\.com\/help\?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=v(?:(?!diag=).)+$/,
      );
  });
});

describeEE("scenarios > admin > troubleshooting > help (EE)", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    setTokenFeatures("all");
  });

  it("should link `Get Help` to help-premium", () => {
    cy.visit("/admin/troubleshooting/help");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Metabase Admin");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Get Help")
      .parents("a")
      .should("have.prop", "href")
      .and(
        "match",
        /^https:\/\/www\.metabase\.com\/help-premium\?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=v.+&diag=%7B.+%7D$/,
      );
  });
});

describe("scenarios > admin > troubleshooting > tasks", () => {
  const total = 57;
  const limit = 50;

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
      name: "Item $page}",
      model: "card",
    };

    const pageRows = [limit, total - limit];
    const length = pageRows[page];

    const stubbedRows = Array.from({ length }, () => row);
    return stubbedRows;
  }

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

// Quarantine the whole spec because it is most likely causing the H2 timeouts and the chained failures!
// NOTE: it will be quarantined on PRs, but will still run on `master`!

// UDATE:
// We need to skip this completely! CI on `master` is almost constantly red.
// TODO:
// Once the underlying problem with H2 is solved, replace `describe.skip` with `describePremium`.
describe("admin > tools > erroring questions ", { tags: "@quarantine" }, () => {
  const TOOLS_ERRORS_URL = "/admin/tools/errors";
  // The filter is required but doesn't have a default value set
  const brokenQuestionDetails = {
    name: "Broken SQL",
    native: {
      "template-tags": {
        filter: {
          id: "ce8f111c-24c4-6823-b34f-f704404572f1",
          name: "filter",
          "display-name": "Filter",
          type: "text",
          required: true,
        },
      },
      query: "select {{filter}}",
    },
    display: "scalar",
  };

  function fixQuestion(name) {
    cy.visit("/collection/root");
    cy.findByText(name).click();
    cy.findByText("Open Editor").click();

    cy.icon("variable").click();
    cy.findByPlaceholderText("Enter a default value…").type("Foo");

    cy.findByText("Save").click();

    modal().within(() => {
      cy.button("Save").click();
    });
  }

  function selectQuestion(name) {
    cy.findByText(name)
      .closest("tr")
      .within(() => {
        cy.findByRole("checkbox").click().should("be.checked");
      });
  }

  describe.skip("when feature enabled", () => {
    beforeEach(() => {
      onlyOnEE();

      restore();
      cy.signInAsAdmin();
      setTokenFeatures("all");

      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    describe("without broken questions", () => {
      it.skip('should render the "Tools" tab and navigate to the "Erroring Questions" by clicking on it', () => {
        // The sidebar has been taken out, because it looks awkward when there's only one elem on it: put it back in when there's more than one
        cy.visit("/admin");

        cy.get("nav").contains("Tools").click();

        cy.location("pathname").should("eq", TOOLS_ERRORS_URL);
        cy.findByRole("link", { name: "Erroring Questions" })
          .should("have.attr", "href")
          .and("eq", TOOLS_ERRORS_URL);
      });

      it("should disable search input fields (metabase#18050)", () => {
        cy.visit(TOOLS_ERRORS_URL);

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No results");
        cy.button("Rerun Selected").should("be.disabled");
        cy.findByPlaceholderText("Error contents").should("be.disabled");
        cy.findByPlaceholderText("DB name").should("be.disabled");
        cy.findByPlaceholderText("Collection name").should("be.disabled");
      });
    });

    describe("with the existing broken questions", () => {
      beforeEach(() => {
        cy.createNativeQuestion(brokenQuestionDetails, {
          loadMetadata: true,
        });

        cy.visit(TOOLS_ERRORS_URL);
      });

      it("should render correctly", () => {
        cy.wait("@dataset");

        selectQuestion(brokenQuestionDetails.name);

        cy.button("Rerun Selected").should("not.be.disabled").click();

        cy.wait("@dataset");

        // The question is still there because we didn't fix it
        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText(brokenQuestionDetails.name);
        cy.button("Rerun Selected").should("be.disabled");

        cy.findByPlaceholderText("Error contents").should("not.be.disabled");
        cy.findByPlaceholderText("DB name").should("not.be.disabled");
        cy.findByPlaceholderText("Collection name")
          .should("not.be.disabled")
          .type("foo");

        cy.wait("@dataset");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No results");
      });

      it("should remove fixed question on a rerun", () => {
        fixQuestion(brokenQuestionDetails.name);

        cy.visit(TOOLS_ERRORS_URL);

        selectQuestion(brokenQuestionDetails.name);

        cy.button("Rerun Selected").should("not.be.disabled").click();

        cy.wait("@dataset");

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("No results");
      });
    });
  });

  describe("when feature disabled", () => {
    beforeEach(() => {
      onlyOnEE();

      restore();
      cy.signInAsAdmin();
    });

    it("should not show tools -> errors", () => {
      cy.visit("/admin");

      appBar().findByText("Tools").should("not.exist");

      cy.visit("/admin/tools/errors");

      main().within(() => {
        cy.findByText("Questions that errored when last run").should(
          "not.exist",
        );
        cy.findByText("We're a little lost...");
      });
    });
  });
});
