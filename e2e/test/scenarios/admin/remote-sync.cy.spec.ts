import yaml from "js-yaml";

import { QA_POSTGRES_PORT, SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import type { Collection, Database } from "metabase-types/api";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const LOCAL_GIT_URL = "file://" + H.LOCAL_GIT_PATH + "/.git";

const REMOTE_QUESTION_NAME = "Remote Sync Test Question";
const STUB_DATABASE_NAME = "Stub Postgres";
const STUB_QUESTION_NAME = "Stub Database Question";

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

    it("disables pulling and pushing when there is nothing to pull or push", () => {
      H.copySyncedCollectionFixture();
      H.commitToRepo();
      H.configureGitAndPullChanges("read-write");

      cy.visit("/collection/root");
      H.getGitSyncControls().findByRole("button", { name: /Sync/ }).click();
      H.popover().within(() => {
        cy.findByRole("menuitem", { name: /Pull changes/ }).should(
          "be.disabled",
        );
        cy.findByRole("menuitem", { name: /Push changes/ }).should(
          "be.disabled",
        );
      });
    });
  });

  describe("settings page", () => {
    beforeEach(() => {
      setup();
      cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
    });

    it("sets up read-write mode", () => {
      H.visitRemoteSyncSettings();
      cy.findByLabelText(/repository url/i).type(LOCAL_GIT_URL);
      cy.findByTestId("admin-layout-content").findByText("Read-write").click();
      cy.button("Set up remote sync").click();
      cy.wait("@saveSettings").its("response.statusCode").should("eq", 200);
      H.undoToast().should("contain.text", "Remote sync settings saved");
      cy.button("Turn off remote sync").should("exist");
    });

    it("disables setup until repository URL is given (#65653)", () => {
      H.visitRemoteSyncSettings();
      cy.button("Set up remote sync").should("be.disabled");
      cy.findByLabelText(/repository url/i).type(LOCAL_GIT_URL);
      cy.button("Set up remote sync").should("be.enabled");
    });

    it("shows error when repository can't be reached", () => {
      H.visitRemoteSyncSettings();
      cy.findByLabelText(/repository url/i).type(
        "file:///tmp/no-such-repository/.git",
      );
      cy.button("Set up remote sync").click();
      cy.wait("@saveSettings").its("response.statusCode").should("eq", 400);
      cy.findByTestId("admin-layout-content")
        .findByRole("alert")
        .should("exist");
    });

    it("turns remote sync off", () => {
      H.configureGit("read-write");
      H.visitRemoteSyncSettings();
      cy.button("Turn off remote sync").click();
      H.modal().button("Turn off").click();
      cy.wait("@saveSettings").its("response.statusCode").should("eq", 200);
      H.expectUnstructuredSnowplowEvent({ event: "remote_sync_deactivated" });
      cy.button("Set up remote sync").should("exist");
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
      H.getGitSyncControls().should("not.exist");
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

    it("keeps Embed sharing option available for questions in read-only synced collections (metabase#72752)", () => {
      H.updateSetting("enable-embedding-modular", true);
      H.configureGitAndPullChanges("read-only");

      cy.visit("/");
      H.goToSyncedCollection();
      H.collectionTable().findByText(REMOTE_QUESTION_NAME).click();
      H.openSharingMenu();
      H.sharingMenu().findByText("Embed").should("be.visible");
    });

    it("refuses changes to synced content", () => {
      H.configureGitAndPullChanges("read-only");
      H.wrapSyncedCollection();

      cy.get<Collection>("@syncedCollection").then((collection) => {
        cy.request({
          method: "POST",
          url: "/api/card",
          failOnStatusCode: false,
          body: {
            name: "Read-only card",
            collection_id: collection.id,
            display: "table",
            visualization_settings: {},
            dataset_query: {
              database: SAMPLE_DB_ID,
              type: "query",
              query: { "source-table": PRODUCTS_ID },
            },
          },
        })
          .its("status")
          .should("eq", 403);
      });
    });
  });

  describe("shared tenant collections", () => {
    beforeEach(() => {
      setup();
      H.enableTenants();
    });

    it("lists shared tenant collections in settings and pushes synced ones", () => {
      H.configureGitAndPullChanges("read-write");
      H.createSharedTenantCollection("Second Tenant Collection");
      H.createSharedTenantCollection("Syncable Tenant Collection").then(
        ({ body: tenantCollection }) => {
          H.visitRemoteSyncSettings();
          cy.findByTestId("admin-layout-content").within(() => {
            cy.findByText("Shared tenant collections to sync").should("exist");
            cy.findByText("Second Tenant Collection").should("exist");
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
      cy.findByRole("button", { name: /new term/i }).should("not.exist");

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
