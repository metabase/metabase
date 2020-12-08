import {
  restore,
  signIn,
  signOut,
  signInAsAdmin,
  USERS,
  signInAsNormalUser,
  describeWithToken,
} from "__support__/cypress";

import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { PRODUCTS } = SAMPLE_DATASET;

const year = new Date().getFullYear();

export function generateQuestions(users) {
  users.forEach(user => {
    signIn(user);

    cy.request("POST", `/api/card`, {
      name: `${user} test q`,
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT * FROM products WHERE {{ID}}",
          "template-tags": {
            ID: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
              name: "ID",
              display_name: "ID",
              type: "dimension",
              dimension: ["field-id", PRODUCTS.ID],
              "widget-type": "category",
              default: null,
            },
          },
        },
        database: 1,
      },
      display: "scalar",
      description: null,
      visualization_settings: {},
      collection_id: null,
      result_metadata: null,
      metadata_checksum: null,
    });
  });
}
export function generateDashboards(users) {
  users.forEach(user => {
    signIn(user);
    cy.visit("/");
    cy.get(".Icon-add").click();
    cy.findByText("New dashboard").click();
    cy.findByLabelText("Name").type(user + " test dash");
    cy.get(".Icon-chevrondown").click();
    cy.findAllByText("Our analytics")
      .last()
      .click();
    cy.findByText("Create").click();
  });
}

describeWithToken("audit > auditing", () => {
  const users = ["admin", "normal"];
  before(() => {
    restore();
    generateQuestions(users);
    generateDashboards(users);
  });

  describe("Generate data to audit", () => {
    beforeEach(signOut);

    it("should view a dashboard", () => {
      signIn("nodata");
      cy.visit("/collection/root?type=dashboard");
      cy.findByText(users[1] + " test dash").click();

      cy.findByText("This dashboard is looking empty.");
      cy.findByText("My personal collection").should("not.exist");
    });

    it("should view old question and new question", () => {
      signIn("nodata");
      cy.visit("/collection/root?type");
      cy.findByText("Orders, Count").click();

      cy.findByText("18,760");

      cy.visit("/collection/root?type");
      cy.findByText(users[0] + " test q").click();

      cy.get('[placeholder="ID"]');
    });

    it("should download a question", () => {
      signInAsNormalUser();
      cy.visit("/question/3");
      cy.server();
      cy.get(".Icon-download").click();
      cy.request("POST", "/api/card/1/query/json");
    });
  });

  describe("See expected info on team member pages", () => {
    beforeEach(signInAsAdmin);

    const all_users = [
      USERS.admin,
      USERS.normal,
      USERS.nodata,
      USERS.nocollection,
      USERS.none,
    ];

    it("should load the Overview tab", () => {
      cy.visit("/admin/audit/members/overview");

      // We haven't created any new members yet so this should be empty
      cy.findByText("Active members and new members per day");
      cy.findByText("No results!");

      // Wait for both of the charts to show up
      cy.get(".dc-chart").should("have.length", 2);

      // For queries viewed, we have 2 users that haven't viewed anything
      cy.get(".LineAreaBarChart")
        .first()
        .find("[width='0']")
        .should("have.length", 2);

      // For queries created, we have 3 users that haven't created anything
      cy.get("svg")
        .last()
        .find("[width='0']")
        .should("have.length", 3);
    });

    it("should load the All Members tab", () => {
      cy.visit("/admin/audit/members/all");

      all_users.forEach(user => {
        cy.findByText(user.first_name + " " + user.last_name);
      });
      cy.get("tr")
        .last()
        .children()
        .eq(-2)
        .should("contain", year);
    });

    it.skip("should load the Audit log (Audit log should display views of dashboards)", () => {
      cy.visit("/admin/audit/members/log");

      cy.findAllByText("Orders, Count").should("have.length", 1);
      cy.findAllByText("admin test q").should("have.length", 1);
      cy.findAllByText("Sample Dataset").should("have.length", 4);
      cy.findByText(users[1] + " test dash");
    });
  });

  describe("See expected info on data pages", () => {
    beforeEach(signInAsAdmin);

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
      cy.findByText("Every hour");
    });

    it("should load both tabs in Schemas", () => {
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
      cy.findByText("REVIEWS");
      cy.findByText("Reviews");
    });
  });

  describe("See expected info on item pages", () => {
    beforeEach(signInAsAdmin);

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
      cy.findByText("normal test q");
      cy.findByText("Orders, Count, Grouped by Created At (year)");
      cy.findByText("4").should("not.exist");
    });

    it("should load both tabs in Dashboards", () => {
      // Overview tab
      cy.visit("/admin/audit/dashboards/overview");
      cy.findByText("Most popular dashboards and their avg loading times");
      cy.findAllByText("Avg. Question Load Time (ms)");
      cy.findByText("normal test dash");
      cy.findByText("Orders");
      cy.findByText("Orders, Count").should("not.exist");

      // All dashboards tab
      cy.visit("/admin/audit/dashboards/all");
      cy.findByPlaceholderText("Dashboard name");
      cy.findByText("admin test dash");
      cy.findByText(USERS.normal.first_name + " " + USERS.normal.last_name);
      cy.get("tr")
        .eq(1)
        .children()
        .last()
        .should("contain", year);
    });

    it("should load both tabs in Downloads", () => {
      // Overview tab
      cy.visit("/admin/audit/downloads/overview");
      cy.findByText("No results!").should("not.exist");
      cy.findByText("Largest downloads in the last 30 days");
      cy.findByText(USERS.normal.first_name + " " + USERS.normal.last_name);

      // All downloads tab
      cy.visit("/admin/audit/downloads/all");
      cy.findByText("No results").should("not.exist");
      cy.get("tr")
        .last()
        .children()
        .first()
        .should("contain", year);
      cy.findAllByText("GUI");
    });
  });
});
