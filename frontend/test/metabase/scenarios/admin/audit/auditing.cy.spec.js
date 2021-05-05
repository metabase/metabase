import { restore, describeWithToken } from "__support__/e2e/cypress";
import { USERS } from "__support__/e2e/cypress_data";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";
const { normal } = USERS;
const { PRODUCTS } = SAMPLE_DATASET;
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
  cy.createDashboard(`${user} dashboard`);
}

describeWithToken("audit > auditing", () => {
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
    cy.visit("/question/3");
    cy.icon("download").click();
    cy.request("POST", "/api/card/1/query/json");

    cy.signIn("nodata");

    cy.log("View normal user's dashboard");
    cy.visit("/collection/root?type=dashboard");
    cy.findByText(NORMAL_DASHBOARD).click();
    cy.findByText("This dashboard is looking empty.");
    cy.findByText("My personal collection").should("not.exist");

    cy.log("View old existing question");
    cy.visit("/question/2");
    cy.findByText("18,760");

    cy.log("View newly created admin's question");
    cy.visit("/collection/root?type");
    cy.findByText(ADMIN_QUESTION).click();
    cy.findByPlaceholderText(/ID/i);
  });

  beforeEach(cy.signInAsAdmin);

  describe("See expected info on team member pages", () => {
    it("should load the Overview tab", () => {
      cy.visit("/admin/audit/members/overview");

      // We haven't created any new members yet so this should be empty
      cy.findByText("Active members and new members per day");
      cy.findByText("No results!");

      // Wait for both of the charts to show up
      cy.get(".dc-chart")
        .as("charts")
        .should("have.length", 2);

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
      cy.findAllByText("Sample Dataset").should("have.length", 4);
      cy.findByText(NORMAL_DASHBOARD);
    });
  });

  describe("See expected info on data pages", () => {
    it("should load both tabs in Databases", () => {
      // Overview tab
      cy.visit("/admin/audit/databases/overview");
      cy.findByText("Total queries and their average speed");
      cy.findByText("No results!").should("not.exist");
      cy.get(".LineAreaBarChart");
      cy.get("rect");

      // All databases tab
      cy.visit("/admin/audit/databases/all");
      cy.findByPlaceholderText("Database name");
      cy.findByText("No results!").should("not.exist");
      cy.findByText("Sample Dataset");
      cy.findByText(/Sync Schedule/i);
      cy.contains(year);
    });

    // [quarantine] flaky
    it.skip("should load both tabs in Schemas", () => {
      // Overview tab
      cy.visit("/admin/audit/schemas/overview");
      cy.get("svg").should("have.length", 2);
      cy.findAllByText("Sample Dataset PUBLIC");
      cy.findAllByText("No results!").should("not.exist");

      // All schemas tab
      cy.visit("/admin/audit/schemas/all");
      cy.findByText("PUBLIC");
      cy.findByText("Saved Queries");
    });

    it("should load both tabs in Tables", () => {
      // Overview tab
      cy.visit("/admin/audit/tables/overview");
      cy.findByText("Most-queried tables");
      cy.findAllByText("No results!").should("not.exist");
      cy.findAllByText("Sample Dataset PUBLIC ORDERS");

      // *** Will fail when code below works again
      cy.findAllByText("Sample Dataset PUBLIC PRODUCTS").should("not.exist");
      // *** Products were there when creating qs by hand. Creating them by calling the api changes the result here.
      // cy.wait(1000).findAllByText("Sample Dataset PUBLIC PRODUCTS");
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
      cy.findByText("REVIEWS"); // Table name in DB
      cy.findByText("Reviews"); // Table display name
    });
  });

  describe("See expected info on item pages", () => {
    it("should load both tabs in Questions", () => {
      // Overview tab
      cy.visit("/admin/audit/questions/overview");
      cy.findByText("Slowest queries");
      cy.findByText("Query views and speed per day");
      cy.findAllByText("No results!").should("not.exist");
      cy.get(".LineAreaBarChart").should("have.length", 3);
      cy.get("rect");
      cy.get(".voronoi");

      // All questions tab
      cy.visit("/admin/audit/questions/all");
      cy.findByPlaceholderText("Question name");
      cy.findAllByText("Sample Dataset").should("have.length", 5);
      cy.findByText(NORMAL_QUESTION);
      cy.findByText("Orders, Count, Grouped by Created At (year)");
      cy.findByText("4").should("not.exist");
    });

    it("should load both tabs in Dashboards", () => {
      // Overview tab
      cy.visit("/admin/audit/dashboards/overview");
      cy.findByText("Most popular dashboards and their avg loading times");
      cy.findAllByText("Avg. Question Load Time (ms)");
      cy.findByText(NORMAL_DASHBOARD);
      cy.findByText("Orders");
      cy.findByText("Orders, Count").should("not.exist");

      // All dashboards tab
      cy.visit("/admin/audit/dashboards/all");
      cy.findByPlaceholderText("Dashboard name");
      cy.findByText(ADMIN_DASHBOARD);
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
      cy.findByText("No results!").should("not.exist");
      cy.findByText("Largest downloads in the last 30 days");
      cy.findByText(normal.first_name + " " + normal.last_name);

      // All downloads tab
      cy.visit("/admin/audit/downloads/all");
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
