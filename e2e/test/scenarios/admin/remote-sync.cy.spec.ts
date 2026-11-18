import yaml from "js-yaml";

import { QA_POSTGRES_PORT } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { Collection, Database } from "metabase-types/api";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const LOCAL_GIT_URL = "file://" + H.LOCAL_GIT_PATH + "/.git";

const REMOTE_QUESTION_NAME = "Remote Sync Test Question";
const STUB_DATABASE_NAME = "Stub Postgres";
const STUB_QUESTION_NAME = "Stub Database Question";
const FIRST_SETUP_TRANSFORM_NAME = "First Setup Transform";

const setup = (snapshot = "default") => {
  H.restore(snapshot);
  H.resetSnowplow();
  cy.signInAsAdmin();
  H.activateToken("pro-self-hosted");
  H.setupGitSync();
  H.interceptTask();
};

const createQuestionIn = (collection: Collection, name: string) =>
  H.createQuestion({
    name,
    query: { "source-table": PRODUCTS_ID },
    collection_id: collection.id,
  });

describe("Remote Sync", () => {
  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("read-write mode", () => {
    beforeEach(() => {
      setup("postgres-writable");
    });

    it("can push and pull changes", () => {
      const UPDATED_REMOTE_QUESTION_NAME = "Updated Question Name";
      H.configureGitWithNewSyncedCollection("read-write").then((collection) =>
        createQuestionIn(collection, REMOTE_QUESTION_NAME),
      );

      cy.visit("/");
      H.getSyncStatusIndicators().should("have.length.greaterThan", 0);
      H.navigationSidebar()
        .findByRole("link", { name: /Test Synced Collection/ })
        .click();
      H.collectionTable().findByText(REMOTE_QUESTION_NAME).should("exist");

      H.pushChanges();
      H.waitForTask({ taskName: "export" });
      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_push_changes",
        triggered_from: "app-bar",
      });
      H.navigationSidebar()
        .findByRole("link", { name: /Test Synced Collection/ })
        .findByTestId("remote-sync-status")
        .should("not.exist");

      H.updateRemoteQuestion(
        (doc) => ({ ...doc, name: UPDATED_REMOTE_QUESTION_NAME }),
        (doc) => expect(doc.name).to.equal(REMOTE_QUESTION_NAME),
      );

      H.clickPullOption();
      H.waitForTask({ taskName: "import" });
      H.expectUnstructuredSnowplowEvent({
        event: "remote_sync_pull_changes",
        triggered_from: "app-bar",
      });
      H.collectionTable()
        .findByText(UPDATED_REMOTE_QUESTION_NAME)
        .should("exist");
    });

    it("refuses to push content that uses unsynced content", () => {
      H.configureGitWithNewSyncedCollection("read-write");
      cy.intercept("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`).as(
        "updateDashboard",
      );

      cy.visit("/collection/root");
      H.openCollectionItemMenu("Orders in a dashboard");
      H.popover().findByText("Move").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        H.entityPickerModalItem(1, "Test Synced Collection").click();
        cy.button("Move").click();
      });
      cy.wait("@updateDashboard").its("response.statusCode").should("eq", 200);

      H.pushChanges();
      H.modal()
        .should("contain.text", "Pushing changes")
        .and("contain.text", "which isn't synced");
    });

    it("merges branch changes when pushing", () => {
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGitAndPullChanges("read-write");

      cy.visit("/collection/root");
      H.moveCollectionItemToSyncedCollection("Orders");
      H.updateRemoteQuestion((doc) => ({
        ...doc,
        name: "Changed on the branch",
      }));

      H.clickPushOption();
      H.modal().within(() => {
        cy.findByText("The branch changed since your last sync.").should(
          "exist",
        );
        cy.findByRole("radio", { name: /Merge the branch changes/ }).should(
          "be.checked",
        );
        cy.findByLabelText("Commit message").type("Merge");
        cy.button("Push").click();
      });
      H.waitForTask({ taskName: "export" });

      H.goToSyncedCollection();
      H.collectionTable().within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByText("Changed on the branch").should("exist");
      });
    });

    it("discards unpushed changes when pulling", () => {
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGitAndPullChanges("read-write");

      cy.visit("/collection/root");
      H.moveCollectionItemToSyncedCollection("Orders");
      H.updateRemoteQuestion((doc) => ({
        ...doc,
        name: "Changed on the branch",
      }));
      H.clickPullOption();
      H.modal().button("Discard my changes").click();
      H.waitForTask({ taskName: "import" });

      H.goToSyncedCollection();
      H.collectionTable().within(() => {
        cy.findByText("Changed on the branch").should("exist");
        cy.findByText("Orders").should("not.exist");
      });
    });
  });

  describe("first-time setup", () => {
    beforeEach(() => {
      setup("postgres-writable");
      H.updateSetting("transforms-enabled", true);
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
      cy.intercept("POST", "/api/ee/data-studio/table/publish-tables").as(
        "publishTables",
      );
      cy.intercept("POST", "/api/transform").as("createTransform");
    });

    it("sets up git sync from scratch, creating Library and syncing it with transforms", () => {
      cy.visit("/admin/settings/remote-sync");
      cy.findByLabelText(/repository url/i)
        .should("be.visible")
        .clear()
        .type(LOCAL_GIT_URL);
      cy.findByTestId("admin-layout-content").findByText("Read-write").click();
      cy.button("Set up remote sync").click();
      cy.wait("@saveSettings").its("response.statusCode").should("eq", 200);
      assertLibrarySynced();

      cy.log("Publish a table to the Library");
      H.DataModel.visitDataStudio();
      H.DataModel.TablePicker.getDatabase("Sample Database").click();
      H.DataModel.TablePicker.getTable("Products").click();
      cy.findByRole("button", { name: /Publish/ }).click();
      H.modal().findByText("Publish this table").click();
      cy.wait("@publishTables");

      cy.log("Create a transform");
      cy.visit("/data-studio/transforms");
      cy.button("Create a transform").click();
      H.popover().findByText("SQL query").click();
      H.popover().findByText("Writable Postgres12").click();
      H.NativeEditor.type("SELECT 1", { allowFastSet: true }).blur();
      H.DataStudio.Transforms.saveChangesButton().click();
      H.modal().within(() => {
        cy.findByLabelText("Name").clear().type(FIRST_SETUP_TRANSFORM_NAME);
        cy.button("Save").click();
      });
      cy.wait("@createTransform").its("response.statusCode").should("eq", 200);

      cy.log("The push lists both the table and the transform");
      H.clickPushOption();
      H.modal().within(() => {
        cy.findAllByText("PRODUCTS").should("have.length.at.least", 1);
        cy.findByText(FIRST_SETUP_TRANSFORM_NAME).should("exist");
        cy.findByLabelText("Commit message").type("First push");
        cy.button("Push").click();
      });
      H.waitForTask({ taskName: "export" });

      cy.log("The repository holds the table and the transform");
      H.wrapSyncedCollectionFiles();
      cy.get<string[]>("@syncedCollectionFiles").then((files) => {
        expect(files).to.include.members([
          "databases/sample_database/schemas/public/tables/products/products___tableusersettings.yaml",
          "collections/transforms/first_setup_transform.yaml",
        ]);
      });
    });

    it("sets up git sync from Data Studio modal, creating Library and syncing it with transforms", () => {
      H.DataModel.visitDataStudio();
      cy.findByRole("button", { name: "Set up remote sync" }).click();
      H.modal().within(() => {
        cy.findByLabelText(/repository url/i).type(LOCAL_GIT_URL, {
          scrollBehavior: "center",
        });
        cy.findByText("Read-write").click();
        cy.button("Set up remote sync").click();
      });
      cy.wait("@saveSettings").its("response.statusCode").should("eq", 200);
      H.modal().should("not.exist");
      assertLibrarySynced();
    });
  });

  describe("read-only mode", () => {
    beforeEach(() => {
      setup();
      H.copySyncedCollectionFixture();
      H.commitToRepo();
    });

    it("pulls branch and changes branches from settings page", () => {
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
      H.visitRemoteSyncSettings();
      cy.findByLabelText(/repository url/i).type(LOCAL_GIT_URL);
      cy.findByTestId("admin-layout-content").findByText("Read-only").click();
      cy.button("Set up remote sync").click();
      cy.wait("@saveSettings");
      H.pollForTask({ taskName: "import" });

      cy.visit("/");
      H.goToSyncedCollection();
      H.collectionTable().findByText(REMOTE_QUESTION_NAME).should("exist");

      H.checkoutSyncedCollectionBranch("test");
      H.updateRemoteQuestion((doc) => ({ ...doc, name: "Test branch name" }));

      H.visitRemoteSyncSettings();
      cy.findByLabelText("Branch").clear().type("test");
      cy.button("Save changes").click();
      cy.wait("@saveSettings");
      H.pollForTask({ taskName: "import" });

      cy.visit("/");
      H.goToSyncedCollection();
      H.collectionTable().findByText("Test branch name").should("exist");
    });
  });

  describe("shared tenant collections", () => {
    beforeEach(() => {
      setup();
      H.enableTenants();
    });

    it("syncs a shared tenant collection chosen in settings and pushes it", () => {
      H.configureGitAndPullChanges("read-write");
      H.createSharedTenantCollection("Syncable Tenant Collection").then(
        ({ body: tenantCollection }) => {
          H.visitRemoteSyncSettings();
          cy.findByTestId("admin-layout-content").within(() => {
            cy.findByRole("switch", {
              name: "Syncable Tenant Collection",
            }).click({ force: true });
            cy.button("Save changes").click();
          });
          H.undoToast().should("contain.text", "Remote sync settings saved");

          H.createQuestion({
            name: "Tenant Question",
            query: { "source-table": PRODUCTS_ID },
            collection_id: tenantCollection.id,
          });

          cy.visit("/");
          H.navigationSidebar()
            .findByRole("treeitem", { name: /Syncable Tenant Collection/ })
            .findByTestId("remote-sync-status")
            .should("exist");

          H.pushChanges();
          H.waitForTask({ taskName: "export" });
          H.navigationSidebar()
            .findByRole("treeitem", { name: /Syncable Tenant Collection/ })
            .findByTestId("remote-sync-status")
            .should("not.exist");
        },
      );
    });
  });

  describe("glossary", () => {
    const GLOSSARY_TERM = "ARR";
    const GLOSSARY_DEFINITION = "Annual recurring revenue";

    const glossaryTab = () => H.DataStudio.nav().findByLabelText("Glossary");

    const visitDataStudioGlossary = () => {
      H.DataModel.visitDataStudio();
      glossaryTab().click();
      cy.findByRole("heading", { name: "Glossary" }).should("be.visible");
    };

    it("flags new terms on Glossary tab and pushes them to repository", () => {
      setup();
      H.createLibrary().then(({ libraryCollectionId }) => {
        H.configureGit("read-write", LOCAL_GIT_URL, {
          [libraryCollectionId]: true,
        });
      });

      visitDataStudioGlossary();
      cy.intercept("POST", "/api/glossary").as("createGlossaryTerm");
      cy.findByRole("button", { name: /new term/i }).click();
      cy.findByPlaceholderText(/boat/i).type(GLOSSARY_TERM);
      cy.findByPlaceholderText(/a small vessel.*/i).type(
        `${GLOSSARY_DEFINITION}{enter}`,
      );
      cy.wait("@createGlossaryTerm");
      glossaryTab().findByTestId("remote-sync-status").should("be.visible");

      H.pushChanges();
      H.waitForTask({ taskName: "export" });
      glossaryTab().findByTestId("remote-sync-status").should("not.exist");

      H.wrapSyncedCollectionFiles();
      cy.get<string[]>("@syncedCollectionFiles").then((files) => {
        const glossaryFile = files.find((file) => file.includes("glossary/"));
        expect(glossaryFile).to.match(/glossary\/arr\.yaml$/);
        cy.readFile(`${H.LOCAL_GIT_PATH}/${glossaryFile}`).then((content) => {
          const doc: unknown = yaml.load(content);
          expect(doc).to.include({
            term: GLOSSARY_TERM,
            definition: GLOSSARY_DEFINITION,
          });
        });
      });
    });

    it("lists pulled terms and locks editing in read-only mode", () => {
      setup();
      H.createLibrary();
      H.copySyncedLibraryFixture();
      H.commitToRepo();
      H.configureGitAndPullChanges("read-only");

      visitDataStudioGlossary();
      cy.get("table").findByText(GLOSSARY_TERM).should("be.visible");

      cy.request("GET", "/api/glossary").then(({ body }) => {
        expect(body.can_write).to.equal(false);
        const [entry] = body.data;
        cy.request({
          method: "PUT",
          url: `/api/glossary/${entry.id}`,
          body: { term: GLOSSARY_TERM, definition: "changed" },
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
        cy.request({
          method: "DELETE",
          url: `/api/glossary/${entry.id}`,
          failOnStatusCode: false,
        })
          .its("status")
          .should("eq", 403);
      });
    });
  });

  describe("stub databases", { tags: ["@external"] }, () => {
    beforeEach(() => {
      setup();
    });

    it("imports cards on missing databases as stubs that run once connected", () => {
      H.copySyncedStubDatabaseFixture();
      H.commitToRepo();
      H.configureGitAndPullChanges("read-write");

      cy.visit("/admin/databases");
      cy.findByRole("link", { name: STUB_DATABASE_NAME })
        .closest("[data-testid='browse-card']")
        .findByText("Stubbed")
        .should("be.visible");
      cy.findByRole("link", { name: STUB_DATABASE_NAME }).click();

      cy.intercept("PUT", "/api/database/*").as("updateDatabase");
      cy.button("Edit connection details").click();
      cy.findByTestId("database-form").within(() => {
        cy.findByLabelText(/Host/).type("localhost");
        cy.findByLabelText(/Port/).type(String(QA_POSTGRES_PORT));
        cy.findByLabelText(/Database name/).type("sample");
        cy.findByLabelText(/Username/).type("metabase");
        cy.findByLabelText(/Password/).type("metasample123");
      });
      cy.button("Save changes").click();
      cy.wait("@updateDatabase");

      cy.request<{ data: Database[] }>("GET", "/api/database").then(
        ({ body }) => {
          const database = body.data.find(
            ({ name }) => name === STUB_DATABASE_NAME,
          );
          H.waitForSyncToFinish({
            dbId: database?.id,
            tableName: "products",
            tableAlias: "productsTable",
          });
        },
      );

      cy.visit("/collection/root");
      H.goToSyncedCollection("Stub Database Collection");
      H.collectionTable().findByText(STUB_QUESTION_NAME).click();
      H.tableInteractive().findByText("Rustic Paper Wallet").should("exist");
    });
  });
});

function assertLibrarySynced() {
  cy.request("/api/ee/library").then(({ body }) =>
    cy
      .request(`/api/collection/${body.id}`)
      .its("body.is_remote_synced")
      .should("eq", true),
  );
}
