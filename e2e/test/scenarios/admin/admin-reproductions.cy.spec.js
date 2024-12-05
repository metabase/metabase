import { H } from "e2e/support";
import { SAMPLE_DB_ID, WRITABLE_DB_ID } from "e2e/support/cypress_data";

describe("issue 26470", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres_12");
    cy.signInAsAdmin();
    cy.request("POST", "/api/persist/enable");
  });

  it("Model Cache enable / disable button should update button text", () => {
    cy.clock(Date.now());
    cy.visit(`/admin/databases/${WRITABLE_DB_ID}`);
    cy.button("Turn model persistence on").click();
    cy.button(/Done/).should("exist");
    cy.tick(6000);
    cy.button("Turn model persistence off").should("exist");
  });
});

describe("issue 33035", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("GET", "/api/user/current").then(({ body: { id: user_id } }) => {
      cy.request("PUT", `/api/user/${user_id}`, { locale: "de" });
    });
  });

  it("databases page should work in a non-default locale (metabase#33035)", () => {
    cy.visit(`/admin/permissions/data/database/${SAMPLE_DB_ID}`);
    cy.findByRole("main").findByText("Orders").should("be.visible");
  });
});

describe("issue 21532", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow navigating back from admin settings (metabase#21532)", () => {
    cy.visit("/");

    cy.icon("gear").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Admin settings").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Getting set up");

    cy.go("back");
    cy.location().should(location => {
      expect(location.pathname).to.eq("/");
    });
  });
});

describe("issue 41765", { tags: ["@external"] }, () => {
  // In this test we are testing the in-browser cache that metabase uses,
  // so we need to navigate by clicking trough the UI without reloading the page.

  const WRITABLE_DB_DISPLAY_NAME = "Writable Postgres12";

  const TEST_TABLE = "scoreboard_actions";
  const TEST_TABLE_DISPLAY_NAME = "Scoreboard Actions";

  const COLUMN_NAME = "another_column";
  const COLUMN_DISPLAY_NAME = "Another Column";

  beforeEach(() => {
    H.resetTestTable({ type: "postgres", table: TEST_TABLE });
    H.restore("postgres-writable");
    cy.signInAsAdmin();

    H.resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TEST_TABLE,
    });
  });

  function enterAdmin() {
    H.appBar().icon("gear").click();
    H.popover().findByText("Admin settings").click();
  }

  function exitAdmin() {
    H.appBar().findByText("Exit admin").click();
  }

  function openWritableDatabaseQuestion() {
    // start new question without navigating
    H.appBar().findByText("New").click();
    H.popover().findByText("Question").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Tables").click();
      cy.findByText(WRITABLE_DB_DISPLAY_NAME).click();
      cy.findByText(TEST_TABLE_DISPLAY_NAME).click();
    });
  }

  it("re-syncing a database should invalidate the table cache (metabase#41765)", () => {
    cy.visit("/");

    H.queryWritableDB(
      `ALTER TABLE ${TEST_TABLE} ADD ${COLUMN_NAME} text;`,
      "postgres",
    );

    openWritableDatabaseQuestion();

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText(COLUMN_DISPLAY_NAME).should("not.exist");

    enterAdmin();

    H.appBar().findByText("Databases").click();
    cy.findAllByRole("link").contains(WRITABLE_DB_DISPLAY_NAME).click();
    cy.button("Sync database schema now").click();

    exitAdmin();
    openWritableDatabaseQuestion();

    H.getNotebookStep("data").button("Pick columns").click();
    H.popover().findByText(COLUMN_DISPLAY_NAME).should("be.visible");
  });
});

describe("(metabase#45042)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("Should display tabs in normal view, and a nav menu in mobile view", () => {
    cy.visit("/admin");

    //Ensure tabs are present in normal view
    cy.findByRole("navigation").within(() => {
      cy.findByRole("link", { name: "Settings" }).should("exist");
      cy.findByRole("link", { name: "Exit admin" }).should("exist");
    });

    //Shrink viewport
    cy.viewport(500, 750);

    //ensure that hamburger is visible and functional
    cy.findByRole("navigation").within(() => {
      cy.findByRole("button", { name: /burger/ })
        .should("exist")
        .click();
      cy.findByRole("list", { name: "Navigation links" }).should("exist");
      cy.findByRole("link", { name: "Settings" }).should("exist");
      cy.findByRole("link", { name: "Exit admin" }).should("exist");
    });

    //Click something to dismiss nav list
    cy.findByRole("link", { name: "General" }).click();
    cy.findByRole("list", { name: "Navigation links" }).should("not.exist");
  });
});

describe("(metabase#46714)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.visit("/admin/datamodel/segment/create");

    cy.findByTestId("segment-editor").findByText("Select a table").click();

    H.entityPickerModal().within(() => {
      cy.findByText("Orders").click();
    });

    cy.findByTestId("segment-editor")
      .findByText("Add filters to narrow your answer")
      .click();
  });

  it("should allow users to apply relative date options in the segment date picker", () => {
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Relative dates…").click();
      cy.findByRole("tab", { name: "Previous" }).click();
      cy.findByLabelText("Starting from…").click();
    });

    H.relativeDatePicker.setValue({ value: 68, unit: "day" });

    H.relativeDatePicker.setStartingFrom({
      value: 70,
      unit: "day",
    });

    H.popover().findByText("Add filter").click();

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At is in the previous 68 days, starting 70 days ago",
    );
  });

  it("should not hide operator select menu behind the main filter popover", () => {
    H.popover().within(() => {
      cy.findByText("Total").click();
    });

    cy.findByLabelText("Filter operator")
      .should("have.text", "Between")
      .click();
    H.popover().last().findByText("Less than").click();
    cy.findByLabelText("Filter operator").should("have.text", "Less than");
    H.popover().findByPlaceholderText("Enter a number").clear().type("1000");
    H.popover().findByText("Add filter").click();

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Total is less than 1000",
    );
  });
});
