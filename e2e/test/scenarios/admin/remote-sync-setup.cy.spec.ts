import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { H } = cy;

const LOCAL_GIT_URL = "file://" + H.LOCAL_GIT_PATH + "/.git";

const FIRST_SETUP_TRANSFORM_NAME = "First Setup Transform";

describe("Remote Sync first-time setup", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    H.setupGitSync();
    H.interceptTask();
    H.updateSetting("transforms-enabled", true);
    cy.intercept("PUT", "/api/ee/remote-sync/settings").as("saveSettings");
    cy.intercept("POST", "/api/ee/data-studio/table/publish-tables").as(
      "publishTables",
    );
    cy.intercept("POST", "/api/transform").as("createTransform");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("sets up git sync from scratch, creating Library and syncing it with transforms", () => {
    H.updateSetting("remote-sync-custom-collections-enabled", false);

    cy.visit("/admin/settings/remote-sync");
    cy.findByLabelText(/repository url/i)
      .should("be.visible")
      .clear()
      .type(LOCAL_GIT_URL);
    cy.findByTestId("admin-layout-content").findByText("Read-write").click();
    cy.findByTestId("admin-layout-content")
      .findByText("Collections to sync")
      .should("not.exist");
    cy.button("Set up remote sync").click();
    cy.wait("@saveSettings").its("response.statusCode").should("eq", 200);

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
      cy.findByText(FIRST_SETUP_TRANSFORM_NAME)
        .scrollIntoView()
        .should("be.visible");
      cy.button(/Push changes/).click();
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

  it("opens branch picker after push while collections to sync are hidden", () => {
    H.updateSetting("remote-sync-custom-collections-enabled", false);
    H.createLibrary().then(({ body: library }) => {
      H.configureGit("read-write", LOCAL_GIT_URL, { [library.id]: true });
    });
    H.createBranchViaSettings("first-branch");

    H.publishTables({ table_ids: [SAMPLE_DATABASE.PRODUCTS_ID] });
    cy.visit("/collection/root");
    H.clickPushOption();
    H.modal()
      .button(/Push changes/)
      .click();
    H.waitForTask({ taskName: "export" });

    cy.log("Branch picker opens with both branches listed");
    H.createBranchViaSettings("second-branch");
    H.getSettingsBranchSwitcher().should("contain.text", "second-branch");
  });
});
