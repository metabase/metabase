import { USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { PortableTable } from "e2e/support/helpers";

const { H } = cy;
const { ORDERS_ID } = SAMPLE_DATABASE;

const DATA_APPS_ANALYTICS_PATH = "/monitor/ai-auditing/data-apps";

const SCOREBOARD_TABLE = "scoreboard_actions";
const ORDERS_TABLE: PortableTable = ["Sample Database", "PUBLIC", "ORDERS"];

const appRoot = (slug: string) =>
  `${Cypress.config("projectRoot")}/e2e/support/assets/data-apps/${slug}`;

/** Reads a saved question when it opens. The fixture's `data_app.yaml` names its collection. */
const QUESTION_APP = {
  slug: "synced-app",
  displayName: "Synced App",
  collection: "syncedAppCollection01",
  question: "syncedAppOrdersCount1",
};

/** Runs an action on a click. The fixture's `data_app.yaml` names its collection. */
const ACTIONS_APP = {
  slug: "synced-actions-app",
  displayName: "Synced Actions App",
  collection: "syncedActionsAppColl1",
};

const ADMIN_NAME = `${USERS.admin.first_name} ${USERS.admin.last_name}`;

function removeTestFiles() {
  cy.task("removeDataAppPaths", {
    paths: [
      `${appRoot(QUESTION_APP.slug)}/queries`,
      `${appRoot(QUESTION_APP.slug)}/collections`,
      `${appRoot(ACTIONS_APP.slug)}/actions`,
      `${appRoot(ACTIONS_APP.slug)}/collections`,
    ],
  });
}

function writeQuestionAppResources(root: string) {
  return H.writeDataAppResources(root, {
    collection: H.dataAppRepresentations.collection(
      QUESTION_APP.collection,
      `Data App: ${QUESTION_APP.displayName}`,
    ),
    cards: [
      H.dataAppRepresentations.card({
        entityId: QUESTION_APP.question,
        name: "OrdersCount",
        type: "question",
        collection: QUESTION_APP.collection,
        table: ORDERS_TABLE,
      }),
    ],
  });
}

function publishQuestionApp() {
  const root = appRoot(QUESTION_APP.slug);

  H.declareDataAppQueries(root, [
    {
      name: "OrdersCount",
      tableId: ORDERS_ID,
      savedQuestionEntityId: QUESTION_APP.question,
    },
  ]);
  writeQuestionAppResources(root);
  return H.publishDataApp(root, QUESTION_APP.slug);
}

/**
 * Publishes the app with the copy of an action it runs into the repository the question app is in.
 * A publish makes the repository's collections what the app's root holds, so this root carries the
 * question app's collection too; otherwise the pull would remove its saved question.
 */
function publishActionsApp() {
  const root = appRoot(ACTIONS_APP.slug);

  return H.createDataAppScoreboardAction().then((source) => {
    const actionCopy = H.newEntityId();

    H.declareDataAppActions(root, [
      {
        exportName: "CreateScore",
        sourceActionId: source.id,
        copiedActionEntityId: actionCopy,
      },
    ]);

    return H.serializeDataAppActionCopies(
      [{ sourceActionId: source.id, entityId: actionCopy }],
      ACTIONS_APP.collection,
    )
      .then((actions) =>
        H.writeDataAppResources(root, {
          collection: H.dataAppRepresentations.collection(
            ACTIONS_APP.collection,
            `Data App: ${ACTIONS_APP.displayName}`,
          ),
          actions,
        }),
      )
      .then(() => writeQuestionAppResources(root))
      .then(() =>
        H.publishDataApp(root, ACTIONS_APP.slug, { initializeRepo: false }),
      );
  });
}

// The first query against the audit view can take a while to settle, and the page's other
// queries share `/api/dataset`, so this waits for the table to stop loading rather than on an alias.
function logTable() {
  cy.findByTestId("data-app-log-table", { timeout: 20000 }).should(
    "have.attr",
    "aria-busy",
    "false",
  );
  return cy.findByTestId("data-app-log-table");
}

const logRows = () => logTable().findAllByTestId("data-app-log-row");

function selectFilterOption(label: string, option: string) {
  H.main().findByLabelText(label).click();
  H.popover().findByRole("option", { name: option }).click();
}

// The log has more columns than the default viewport fits.
describe(
  "scenarios > monitor > ai auditing > data app analytics",
  { tags: ["@external", "@actions"], viewportWidth: 1600 },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");

      H.resetTestTable({ type: "postgres", table: SCOREBOARD_TABLE });
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SCOREBOARD_TABLE });
      H.setActionsEnabledForDB(WRITABLE_DB_ID);

      removeTestFiles();
    });

    after(() => {
      removeTestFiles();
    });

    it("lists the questions and actions published data apps run, and narrows the log by entity type and app", () => {
      publishQuestionApp();
      publishActionsApp();

      cy.log("Read the question in one app");
      cy.intercept("POST", "/api/dataset").as("appQuery");
      H.mockDataApp(QUESTION_APP.slug, {
        displayName: QUESTION_APP.displayName,
      });
      cy.visit(`/apps/${QUESTION_APP.slug}`);
      H.dataAppIframe(QUESTION_APP.displayName)
        .findByTestId("synced-app-total", { timeout: 30000 })
        .should(($total) => {
          expect(Number($total.text())).to.be.greaterThan(0);
        });
      cy.wait("@appQuery");

      cy.log("Run the action in the other");
      cy.intercept("POST", "/api/action/*/execute").as("execute");
      H.mockDataApp(ACTIONS_APP.slug, {
        displayName: ACTIONS_APP.displayName,
      });
      cy.visit(`/apps/${ACTIONS_APP.slug}`);
      H.dataAppIframe(ACTIONS_APP.displayName).within(() => {
        cy.findByTestId("action-execute", { timeout: 30000 }).click();
        cy.findByTestId("action-output").should("have.text", "executed");
      });
      cy.wait("@execute");

      cy.log(
        "The page names the apps from the installed list, which the app mocks replaced",
      );
      cy.intercept("GET", "/api/apps", (req) => {
        req.continue();
      });

      cy.visit(DATA_APPS_ANALYTICS_PATH);
      cy.findByTestId("monitor-nav")
        .findByRole("link", { name: "Data app analytics" })
        .should("be.visible");
      H.main()
        .findByRole("heading", { name: "Data app analytics" })
        .should("be.visible");

      cy.log("Both apps' records, by app and user");
      logRows()
        .should("contain", QUESTION_APP.displayName)
        .and("contain", QUESTION_APP.slug)
        .and("contain", ACTIONS_APP.displayName)
        .and("contain", ACTIONS_APP.slug)
        .and("contain", "Question")
        .and("contain", "OrdersCount")
        .and("contain", ADMIN_NAME);

      cy.log("Only the action runs");
      selectFilterOption("Entity type", "Action");
      cy.location("search").should("contain", "type=action");
      logRows()
        .should("contain", ACTIONS_APP.slug)
        .and("not.contain", QUESTION_APP.slug)
        .and("not.contain", "Question");

      cy.log("Only the question app's records");
      selectFilterOption("Entity type", "All entity types");
      selectFilterOption("Data app", QUESTION_APP.displayName);
      cy.location("search").should("contain", `app=${QUESTION_APP.slug}`);
      logRows()
        .should("contain", QUESTION_APP.slug)
        .and("contain", "Question")
        .and("not.contain", ACTIONS_APP.slug);
    });
  },
);
