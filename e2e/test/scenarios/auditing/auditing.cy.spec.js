import { restore, describeEE, visitQuestion } from "e2e/support/helpers";
import {
  USERS,
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
const { normal } = USERS;
const { PRODUCTS } = SAMPLE_DATABASE;
const TOTAL_USERS = Object.entries(USERS).length;

const year = new Date().getFullYear();

function generateQuestions(user) {
  cy.createNativeQuestion({
    name: `${user} question`,
    native: {
      query: "SELECT * FROM products WHERE {{ID}}",
      "template-tags": {
        ID: {
          id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
          name: "ID",
          display_name: "ID",
          type: "dimension",
          dimension: ["field", PRODUCTS.ID, null],
          "widget-type": "category",
          default: null,
        },
      },
    },
    display: "scalar",
  });
}

function generateDashboards(user) {
  cy.createDashboard({ name: `${user} dashboard` });
}

describeEE("audit > auditing", () => {
  const ADMIN_QUESTION = "admin question";
  const ADMIN_DASHBOARD = "admin dashboard";
  const NORMAL_QUESTION = "normal question";
  const NORMAL_DASHBOARD = "normal dashboard";

  before(() => {
    restore();
    ["admin", "normal"].forEach(user => {
      cy.signIn(user);
      generateQuestions(user);
      generateDashboards(user);
    });

    cy.log("Download a question");
    visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
    cy.icon("download").click();
    cy.request("POST", "/api/card/1/query/json");

    cy.signIn("nodata");

    cy.log("View normal user's dashboard");
    cy.visit("/collection/root?type=dashboard");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(NORMAL_DASHBOARD).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This dashboard is looking empty.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("My personal collection").should("not.exist");

    cy.log("View old existing question");
    visitQuestion(ORDERS_COUNT_QUESTION_ID);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("18,760");

    cy.log("View newly created admin's question");
    cy.visit("/collection/root?type");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(ADMIN_QUESTION).click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/ID/i);
  });

  beforeEach(cy.signInAsAdmin);

  describe("See expected info on team member pages", () => {
    it("should load the Overview tab", () => {
      cy.visit("/admin/audit/members/overview");

      // We haven't created any new members yet so this should be empty
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Active members and new members per day");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No results!");

      // Wait for both of the charts to show up
      cy.get(".dc-chart").as("charts").should("have.length", 2);

      // For queries viewed, only 3 viewed something
      cy.get("@charts")
        .first()
        .find("[width='0']")
        .should("have.length", TOTAL_USERS - 3);

      // For queries created, only 2 users created something
      cy.get("@charts")
        .last()
        .find("[width='0']")
        .should("have.length", TOTAL_USERS - 2);
    });

    it("should load the All Members tab", () => {
      cy.visit("/admin/audit/members/all");

      Object.values(USERS).forEach(({ first_name, last_name }) => {
        cy.findByText(`${first_name} ${last_name}`);
      });

      cy.get("tr")
        .last()
        .children()
        .eq(-2)
        .as("lastActive")
        .should("contain", year);
    });

    it.skip("audit log should display views of dashboards (metabase-enterprise#287)", () => {
      cy.visit("/admin/audit/members/log");

      cy.findAllByText("Orders, Count").should("have.length", 1);
      cy.findAllByText(ADMIN_QUESTION).should("have.length", 1);
      cy.findAllByText("Sample Database").should("have.length", 4);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(NORMAL_DASHBOARD);
    });
  });

  describe("See expected info on data pages", () => {
    it("should load both tabs in Databases", () => {
      // Overview tab
      cy.visit("/admin/audit/databases/overview");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total queries and their average speed");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No results!").should("not.exist");
      cy.get(".LineAreaBarChart");
      cy.get("rect");

      // All databases tab
      cy.visit("/admin/audit/databases/all");
      cy.findByPlaceholderText("Database name");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No results!").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Sample Database");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/Sync Schedule/i);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains(year);
    });

    // [quarantine] flaky
    it.skip("should load both tabs in Schemas", () => {
      // Overview tab
      cy.visit("/admin/audit/schemas/overview");
      cy.get("svg").should("have.length", 2);
      cy.findAllByText("Sample Database PUBLIC");
      cy.findAllByText("No results!").should("not.exist");

      // All schemas tab
      cy.visit("/admin/audit/schemas/all");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("PUBLIC");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Saved Queries");
    });

    it("should load both tabs in Tables", () => {
      // Overview tab
      cy.visit("/admin/audit/tables/overview");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Most-queried tables");
      cy.findAllByText("No results!").should("not.exist");
      cy.findAllByText("Sample Database PUBLIC ORDERS");

      // *** Will fail when code below works again
      cy.findAllByText("Sample Database PUBLIC PRODUCTS").should("not.exist");
      // *** Products were there when creating qs by hand. Creating them by calling the api changes the result here.
      // cy.wait(1000).findAllByText("Sample Database PUBLIC PRODUCTS");
      // cy.get(".rowChart")
      //   .first()
      //   .find('[height="30"]')
      //   .should("have.length", 2);
      // cy.get(".rowChart")
      //   .last()
      //   .find("[height='30']")
      //   .should("have.length", 2);

      // All tables tab
      cy.visit("/admin/audit/tables/all");
      cy.findByPlaceholderText("Table name");
      cy.findAllByText("PUBLIC").should("have.length", 4);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("REVIEWS"); // Table name in DB
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Reviews"); // Table display name
    });
  });

  describe("See expected info on item pages", () => {
    it("should load both tabs in Questions", () => {
      // Overview tab
      cy.visit("/admin/audit/questions/overview");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Slowest queries");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Query views and speed per day");
      cy.findAllByText("No results!").should("not.exist");
      cy.get(".LineAreaBarChart").should("have.length", 3);
      cy.get("rect");
      cy.get(".voronoi");

      // All questions tab
      cy.visit("/admin/audit/questions/all");
      cy.findByPlaceholderText("Question name");
      cy.findAllByText("Sample Database").should("have.length", 5);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(NORMAL_QUESTION);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders, Count, Grouped by Created At (year)");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("4").should("not.exist");
    });

    it("should load both tabs in Dashboards", () => {
      // Overview tab
      cy.visit("/admin/audit/dashboards/overview");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Most popular dashboards and their avg loading times");
      cy.findAllByText("Avg. Question Load Time (ms)");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(NORMAL_DASHBOARD);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Orders, Count").should("not.exist");

      // All dashboards tab
      cy.visit("/admin/audit/dashboards/all");
      cy.findByPlaceholderText("Dashboard name");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(ADMIN_DASHBOARD);
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(normal.first_name + " " + normal.last_name);
      cy.get("tr")
        .eq(1)
        .children()
        .last()
        .as("lastEdited")
        .should("contain", year);
    });

    it("should load both tabs in Downloads", () => {
      // Overview tab
      cy.visit("/admin/audit/downloads/overview");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No results!").should("not.exist");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Largest downloads in the last 30 days");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(normal.first_name + " " + normal.last_name);

      // All downloads tab
      cy.visit("/admin/audit/downloads/all");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("No results").should("not.exist");
      cy.get("tr")
        .last()
        .children()
        .first()
        .as("downloadedAt")
        .should("contain", year);
      cy.findAllByText("GUI");
    });
  });
});
