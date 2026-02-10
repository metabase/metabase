import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import {
  FIRST_COLLECTION_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { H } = cy;

describe("better onboarding via sidebar", { tags: "@external" }, () => {
  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("Add data modal analytics", () => {
    beforeEach(() => {
      H.resetSnowplow();
      H.restore();

      cy.signInAsAdmin();
      H.enableTracking();
    });

    it("should track the button click from the 'Getting Started' section", () => {
      cy.visit("/");
      H.navigationSidebar()
        .findByRole("tab", { name: /^Getting Started/i })
        .findByLabelText("Add your data")
        .should("be.visible")
        .click();
      addDataModal().should("be.visible");
      H.expectUnstructuredSnowplowEvent({
        event: "data_add_modal_opened",
        triggered_from: "getting-started",
      });
    });

    it("should track the button click from the 'Data' section", () => {
      cy.visit("/");
      openAddDataModalFromSidebar();
      addDataModal().should("be.visible");
      H.expectUnstructuredSnowplowEvent({
        event: "data_add_modal_opened",
        triggered_from: "left-nav",
      });
    });

    it("should track tab clicks within the 'Add data' modal", () => {
      cy.visit("/");
      openAddDataModalFromSidebar();

      cy.log("Tracking shouldn't happen on the default open tab");
      getTab("Database").should("have.attr", "data-active", "true");

      cy.log("Track when CSV tab opens");
      openTab("CSV");
      H.expectUnstructuredSnowplowEvent({
        event: "csv_tab_clicked",
        triggered_from: "add-data-modal",
      });

      cy.log("Ignore the repeated click");
      openTab("CSV");
      H.expectUnstructuredSnowplowEvent(
        {
          event: "csv_tab_clicked",
          triggered_from: "add-data-modal",
        },
        1,
      );

      cy.log("Track when Database tab opens");
      openTab("Database");
      // We confirm that it didn't track the default open tab because the following assertion passes.
      // If there were multiple events like this, the count would be higher
      H.expectUnstructuredSnowplowEvent(
        {
          event: "database_tab_clicked",
          triggered_from: "add-data-modal",
        },
        1,
      );
    });

    it("should track database selection", () => {
      cy.visit("/");
      openAddDataModalFromSidebar();
      addDataModal()
        .findByRole("listbox")
        .findByText("Snowflake")
        .should("be.visible")
        .click();
      cy.location("pathname").should("eq", "/admin/databases/create");
      H.expectUnstructuredSnowplowEvent({
        event: "database_setup_selected",
        event_detail: "snowflake",
        triggered_from: "add-data-modal",
      });
    });

    it("should track CSV file selection click", () => {
      cy.log("Enable uploads");
      cy.request("PUT", "/api/setting/uploads-settings", {
        value: {
          db_id: SAMPLE_DB_ID,
          schema_name: "PUBLIC",
          table_prefix: null,
        },
      });

      cy.visit("/");
      openAddDataModalFromSidebar();
      openTab("CSV");
      addDataModal().findByText("Select a file").click();

      H.expectUnstructuredSnowplowEvent({
        event: "csv_upload_clicked",
        triggered_from: "add-data-modal",
      });
    });
  });
});

describe("Add data modal", () => {
  beforeEach(() => {
    H.restore();
  });

  it("should hide Getting Started but still offer to add data for white labeled instances", () => {
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    // The condition will not kick in without changing the app name. Do not remove this API call.
    cy.request("PUT", "/api/setting/application-name", {
      value: "FooBar, Inc.",
    });

    cy.visit("/");
    H.navigationSidebar().within(() => {
      cy.findByText("Home").should("be.visible");
      cy.findByText(/Getting Started/i).should("not.exist");

      cy.log("Adding data from the 'Data' section should work");
      cy.findByRole("section", { name: "Data" })
        .findByLabelText("Add data")
        .click();
    });

    addDataModal().should("be.visible");
  });

  describe("'Database' tab", () => {
    it("should work properly for admins", () => {
      cy.signInAsAdmin();
      cy.visit("/");
      openAddDataModalFromSidebar();

      addDataModal().within(() => {
        cy.log("Admin should be able to manage databases");
        cy.findByRole("link", { name: "Manage databases" }).should(
          "have.attr",
          "href",
          "/admin/databases",
        );

        cy.log("Elevated engines should be shown initially");
        cy.findAllByRole("option")
          .should("have.length", 6)
          .and("contain", "MySQL")
          .and("contain", "PostgreSQL")
          .and("contain", "SQL Server")
          .and("contain", "Amazon Redshift")
          .and("contain", "BigQuery")
          .and("contain", "Snowflake");

        cy.log("The list is initially not expanded");
        cy.findByText("Show more").should("be.visible");

        cy.log("Searching automatically expands the list");
        cy.findByPlaceholderText("Search databases").type("re");
        cy.findAllByRole("option").should("contain", "Presto");

        cy.log(
          "Collapsing the list resets search value and shows the initial elevated engines list",
        );
        cy.findByText("Hide").click();
        cy.findByPlaceholderText("Search databases").should("have.value", "");
        cy.findAllByRole("option")
          .should("have.length", 6)
          .and("contain", "MySQL")
          .and("contain", "PostgreSQL")
          .and("contain", "SQL Server")
          .and("contain", "Amazon Redshift")
          .and("contain", "BigQuery")
          .and("contain", "Snowflake")
          .and("not.contain", "Presto");

        cy.log("Admin can manually expand the list");
        cy.findByText("Show more").click();
        cy.findAllByRole("option").should("have.length.greaterThan", 6);

        cy.log("Clicking on an engine opens the database form for that engine");
        cy.findByText("Snowflake").click();
        cy.location("pathname").should("eq", "/admin/databases/create");
        cy.location("search").should("eq", "?engine=snowflake");
      });

      cy.findByRole("heading", { name: "Add a database" }).should("be.visible");
      cy.findByLabelText("Database type").should("have.value", "Snowflake");
    });

    it("should not offer to add data when in full app embedding", () => {
      cy.signInAsNormalUser();
      H.visitFullAppEmbeddingUrl({ url: "/", qs: {} });

      H.navigationSidebar().within(() => {
        cy.findByText("Home").should("be.visible");
        cy.log("Make sure we don't display the 'Getting Started' section");
        cy.findByText(/Getting Started/i).should("not.exist");
        cy.findByText("Add your data").should("not.exist");

        cy.log(
          "Make sure we don't display the 'Add data' button in the 'Data' section",
        );
        cy.findByText(/^Data$/i).should("be.visible");
        cy.findByLabelText("Add data").should("not.exist");
      });
    });
  });

  describe("'CSV' tab", () => {
    it("admins should be able to enable uploads initially", () => {
      cy.signInAsAdmin();
      cy.visit("/");
      openAddDataModalFromSidebar();
      openTab("CSV");
      addDataModal().findByText("Enable uploads").click();

      cy.location("pathname").should("eq", "/admin/settings/uploads");
      cy.findByLabelText("Database to use for uploads").click();
      H.popover().contains("Sample Database").click();
      cy.findByLabelText("Schema").click();
      H.popover().contains("PUBLIC").click();
      cy.intercept("PUT", "/api/setting/uploads-settings").as("enableUploads");
      cy.button("Enable uploads").click();
      cy.wait("@enableUploads");

      H.goToMainApp();
      H.navigationSidebar()
        .findByRole("section", { name: "Data" })
        .findByLabelText("Add data")
        .should("be.visible")
        .click();

      openTab("CSV");
      addDataModal().within(() => {
        cy.get("#add-data-modal-upload-csv-input").selectFile(
          {
            contents: Cypress.Buffer.from(
              "header1,header2\nvalue1,value2",
              "utf8",
            ),
            fileName: "foo-bar.csv",
            mimeType: "text/csv",
            lastModified: Date.now(),
          },
          { force: true },
        );
        cy.findByLabelText("Select a collection").should(
          "contain",
          "Our analytics",
        );
        cy.button("Upload").should("be.enabled").click();
      });

      addDataModal().should("not.exist");
      cy.findByTestId("status-root-container")
        .findByText("Start exploring")
        .click();

      cy.log("Assert that we loaded the model created from CSV");
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");

      cy.findByTestId("head-crumbs-container")
        .should("contain", "Our analytics")
        .and("contain", "Foo Bar");

      H.tableInteractiveHeader()
        .should("contain", "Header1")
        .and("contain", "Header2");
      H.tableInteractiveBody()
        .should("contain", "value1")
        .and("contain", "value2");
    });

    it("CSV upload should work for non-admins with spotty collection permissions", () => {
      cy.signInAsAdmin();

      cy.log("Enable uploads");
      cy.request("PUT", "/api/setting/uploads-settings", {
        value: {
          db_id: SAMPLE_DB_ID,
          schema_name: "PUBLIC",
          table_prefix: null,
        },
      });

      cy.updateCollectionGraph({
        [USER_GROUPS.DATA_GROUP]: {
          [FIRST_COLLECTION_ID]: "read",
          [SECOND_COLLECTION_ID]: "write",
        },
      });

      cy.signIn("nocollection");
      cy.visit("/");
      openAddDataModalFromSidebar();
      openTab("CSV");

      addDataModal().within(() => {
        cy.button("Upload").should("be.disabled");

        cy.findByTestId("add-data-modal-csv-dropzone").selectFile(
          {
            contents: Cypress.Buffer.from(
              "header1,header2\nvalue1,value2",
              "utf8",
            ),
            fileName: "foo-bar.csv",
            mimeType: "text/csv",
            lastModified: Date.now(),
          },
          { action: "drag-drop" },
        );

        cy.findByLabelText("Select a collection")
          .should("contain", "No Collection Tableton's Personal Collection")
          .click();
      });

      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Collections").click();
        H.entityPickerModalItem(1, "First collection").click();
        cy.button("Select this collection").should("be.disabled");
        H.entityPickerModalItem(2, "Second collection").click();
        cy.button("Select this collection").should("be.enabled").click();
      });

      addDataModal().within(() => {
        cy.findByLabelText("Select a collection").should(
          "contain",
          "Second collection",
        );
        cy.button("Upload").should("be.enabled").click();
      });

      addDataModal().should("not.exist");
      cy.findByTestId("status-root-container")
        .findByText("Start exploring")
        .click();

      cy.log("Assert that we loaded the model created from CSV");
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");

      cy.findByTestId("head-crumbs-container")
        .should("contain", "Second collection")
        .and("contain", "Foo Bar");

      H.tableInteractiveHeader()
        .should("contain", "Header1")
        .and("contain", "Header2");
      H.tableInteractiveBody()
        .should("contain", "value1")
        .and("contain", "value2");
    });

    it("should be hidden for non-admins without upload permissions", () => {
      cy.signInAsNormalUser();
      cy.visit("/");
      cy.findByRole("section", { name: "Data" }).within(() => {
        cy.findByLabelText("Add data").should("not.exist");
      });
    });
  });
});

const addDataModal = () => cy.findByRole("dialog", { name: "Add data" });

const openAddDataModalFromSidebar = () =>
  H.navigationSidebar()
    .findByRole("section", { name: "Data" })
    .findByLabelText("Add data")
    .should("be.visible")
    .click();

const getTab = (tab: string) =>
  addDataModal().findAllByRole("tab").filter(`:contains(${tab})`);

const openTab = (tab: string) => {
  getTab(tab).click();
};
