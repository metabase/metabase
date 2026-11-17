import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const TEAMS_TABLE = "scoreboard_actions";
const APP_SLUG = "teams";
const APP_NAME = "Teams";
const ADMIN_NAME = `${USERS.admin.first_name} ${USERS.admin.last_name}`;

// The first query against the audit view can take a while to settle, and the page's other
// queries share `/api/dataset`, so this waits for the table to stop loading rather than on an alias.
function logRows() {
  cy.findByTestId("data-app-log-table", { timeout: 20000 }).should(
    "have.attr",
    "aria-busy",
    "false",
  );
  return cy
    .findByTestId("data-app-log-table")
    .findAllByTestId("data-app-log-row");
}

function selectFilterOption(label: string, option: string) {
  H.main().findByLabelText(label).click();
  H.popover().findByRole("option", { name: option }).click();
}

// The log has more columns than the default viewport fits.
describe(
  "scenarios > data apps > monitor",
  { tags: ["@external", "@actions"], viewportWidth: 1600 },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resetTestTable({ type: "postgres", table: TEAMS_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: TEAMS_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);

      H.createLibrary();
      H.setupGitSync();
      H.copyDataAppsFixture();
      H.commitToRepo("Add data apps");
      H.configureGitAndPullChanges("read-only");
    });

    it("lists the questions and actions an app runs, and narrows the log by entity type and app", () => {
      cy.intercept("POST", "/api/action/*/execute").as("execute");
      H.openDataApp(APP_SLUG);
      H.dataAppIframe(APP_NAME).within(() => {
        cy.findByText("Amorous Aardvarks: 0", { timeout: 30000 }).should(
          "be.visible",
        );
        cy.findByLabelText("Team name").type("Data App FC");
        cy.findByRole("button", { name: "Add team" }).click();
      });
      cy.wait("@execute");

      cy.visit("/monitor/ai-auditing/data-apps");
      cy.findByTestId("monitor-nav")
        .findByRole("link", { name: "Data app analytics" })
        .should("be.visible");

      cy.log("the app's records, by app and user");
      logRows()
        .should("contain", APP_NAME)
        .and("contain", APP_SLUG)
        .and("contain", "Question")
        .and("contain", "teamList")
        .and("contain", "Action")
        .and("contain", ADMIN_NAME);

      cy.log("only the action runs");
      selectFilterOption("Entity type", "Action");
      cy.location("search").should("contain", "type=action");
      logRows().should("contain", APP_SLUG).and("not.contain", "teamList");

      cy.log("only the app's records");
      selectFilterOption("Entity type", "All entity types");
      selectFilterOption("Data app", APP_NAME);
      cy.location("search").should("contain", `app=${APP_SLUG}`);
      logRows().should("contain", "teamList");
    });
  },
);
