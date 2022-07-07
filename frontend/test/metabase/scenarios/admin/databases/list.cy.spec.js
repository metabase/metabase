import { restore, describeEE, isOSS } from "__support__/e2e/helpers";

describe("scenarios > admin > databases > list", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("OSS", { tags: "@OSS" }, () => {
    it("should not display error messages upon a failed `GET` (metabase#20471)", () => {
      cy.onlyOn(isOSS);

      const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

      cy.intercept(
        {
          method: "GET",
          pathname: "/api/database",
        },
        req => {
          req.reply({
            statusCode: 500,
            body: { message: errorMessage },
          });
        },
      ).as("failedGet");

      cy.visit("/admin/databases");

      cy.wait("@failedGet");
      // Not sure how exactly is this going the be fixed, but we should't show the full error message on the page in any case
      cy.findByText(errorMessage).should("not.be.visible");
    });
  });

  describeEE("EE", () => {
    it("should not display error messages upon a failed `GET` (metabase#20471)", () => {
      const errorMessage = "Lorem ipsum dolor sit amet, consectetur adip";

      cy.intercept(
        {
          method: "GET",
          pathname: "/api/database",
          query: {
            exclude_uneditable_details: "true",
          },
        },
        req => {
          req.reply({
            statusCode: 500,
            body: { message: errorMessage },
          });
        },
      ).as("failedGet");

      cy.visit("/admin/databases");

      cy.wait("@failedGet");
      // Not sure how exactly is this going the be fixed, but we should't show the full error message on the page in any case
      cy.findByText(errorMessage).should("not.be.visible");
    });
  });

  it("should let you see databases in list view", () => {
    cy.visit("/admin/databases");
    cy.findByText("Sample Database");
    cy.findByText("H2");
  });

  it("should not let you see saved questions in the database list", () => {
    cy.visit("/admin/databases");
    cy.get("tr").should("have.length", 2);
  });

  it("should let you view a database's detail view", () => {
    cy.visit("/admin/databases");
    cy.contains("Sample Database").click();
    cy.url().should("match", /\/admin\/databases\/\d+$/);
  });

  it("should let you add a database", () => {
    cy.visit("/admin/databases");
    cy.contains("Add database").click();
    cy.url().should("match", /\/admin\/databases\/create$/);
    // *** code here should be more thorough
  });

  it("should let you access edit page a database", () => {
    cy.visit("/admin/databases");
    cy.contains("Sample Database").click();
    cy.url().should("match", /\/admin\/databases\/1$/);
  });

  it("should let you bring back the sample database", () => {
    cy.intercept("POST", "/api/database/sample_database").as("sample_database");

    cy.request("DELETE", "/api/database/1").as("delete");
    cy.visit("/admin/databases");
    cy.contains("Bring the sample database back").click();
    cy.wait("@sample_database");
    cy.contains("Sample Database").click();
    cy.url().should("match", /\/admin\/databases\/\d+$/);
  });

  it("should display a deprecated database warning", () => {
    cy.intercept("/api/database*", req => {
      req.reply(res => {
        res.body.data = res.body.data.map(database => ({
          ...database,
          engine: "presto",
        }));
      });
    });

    cy.visit("/admin");

    cy.findByRole("status").within(() => {
      cy.findByText("Database driver");
      cy.findByText(/which is now deprecated/);
      cy.findByText("Database driver").click();
    });

    cy.findByRole("table").within(() => {
      cy.findByText("Sample Database");
    });

    cy.findByRole("status").within(() => {
      cy.findByLabelText("close icon").click();
    });

    cy.findByRole("status").should("not.exist");
  });
});
