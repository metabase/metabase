const { H } = cy;
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { TableId } from "metabase-types/api";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE_ID,
  FEEDBACK,
  FEEDBACK_ID,
} = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;
const MYSQL_DB_ID = SAMPLE_DB_ID + 1;
const MYSQL_DB_SCHEMA_ID = `${MYSQL_DB_ID}:`;

const CUSTOM_MAPPING_ERROR =
  "You need unrestricted data access on this table to map custom display values.";

describe("scenarios > admin > datamodel > editor", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/database/*/schema/*").as("fetchTables");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("fetchMetadata");
    cy.intercept("PUT", "/api/table").as("updateTables");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
    cy.intercept("POST", "/api/field/*/dimension").as("updateFieldDimension");
  });

  describe("field settings", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should allow changing the field visibility", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      H.DataModel.FieldSection.getVisibilityInput().click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Visibility for Tax updated");
      H.DataModel.FieldSection.getVisibilityInput().should(
        "have.value",
        "Do not include",
      );

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field semantic type and currency", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TAX,
      });

      H.DataModel.FieldSection.getSemanticTypeInput()
        .should("have.value", "No semantic type")
        .click();
      H.popover().findByText("Currency").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for Tax updated");

      H.DataModel.FieldSection.getSemanticTypeCurrencyInput()
        .should("be.visible")
        .and("have.value", "US Dollar")
        .click();
      H.popover().findByText("Canadian Dollar").click();
      cy.wait("@updateField");

      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax (CA$)").should("be.visible");
    });

    it("should allow changing the field foreign key target", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.USER_ID,
      });

      H.DataModel.FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "People → ID")
        .click();
      H.popover().findByText("Products → ID").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for User ID updated");
      H.DataModel.FieldSection.getSemanticTypeFkTarget().should(
        "have.value",
        "Products → ID",
      );

      H.openTable({
        database: SAMPLE_DB_ID,
        table: ORDERS_ID,
        mode: "notebook",
      });
      cy.icon("join_left_outer").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User ID").should("be.visible");
    });

    it("should allow you to cast a field to a data type", () => {
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: FEEDBACK_ID,
        fieldId: FEEDBACK.RATING,
      });

      cy.log(
        "Ensure that Coercion strategy has been humanized (metabase#44723)",
      );
      H.DataModel.FieldSection.getCoercionToggle()
        .parent()
        .scrollIntoView()
        .click();
      H.popover().should("not.contain.text", "Coercion");
      H.popover().findByText("UNIX seconds → Datetime").click();
      cy.wait("@updateField");

      H.openTable({ database: SAMPLE_DB_ID, table: FEEDBACK_ID });
      cy.findAllByTestId("cell-data")
        .contains("December 31, 1969, 4:00 PM")
        .should("have.length.greaterThan", 0);
    });
  });

  describe("data model permissions", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should allow changing the table name with data model permissions only", () => {
      setDataModelPermissions({ tableIds: [ORDERS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getNameInput().clear().type("New orders").blur();
      cy.wait("@updateTable");

      H.DataModel.TableSection.getNameInput().should(
        "have.value",
        "New orders",
      );

      H.undoToast().should("contain.text", "Table name updated");
      cy.signOut();

      cy.signInAsNormalUser();
      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("New orders").should("be.visible");
      });
    });

    it("should allow changing the field name with data model permissions only in table settings", () => {
      setDataModelPermissions({ tableIds: [ORDERS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });
      H.DataModel.TableSection.getFieldNameInput("Tax")
        .clear()
        .type("New tax")
        .blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Display name for Tax updated");
      H.DataModel.TableSection.getFieldNameInput("New tax").should(
        "be.visible",
      );
      H.DataModel.TableSection.getField("New tax").should("be.visible");

      cy.signInAsNormalUser();
      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New tax").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field name with data model permissions only in field settings", () => {
      setDataModelPermissions({ tableIds: [ORDERS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.TOTAL,
      });

      H.DataModel.FieldSection.getNameInput().clear().type("New total").blur();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Display name for Total updated");
      H.DataModel.FieldSection.getNameInput().should("have.value", "New total");
      H.DataModel.TableSection.getFieldNameInput("New total")
        .scrollIntoView()
        .should("be.visible");

      cy.signInAsNormalUser();
      H.openOrdersTable();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("New total").should("be.visible");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").should("not.exist");
    });

    it("should allow changing the field foreign key target", () => {
      setDataModelPermissions({
        tableIds: [ORDERS_ID, PRODUCTS_ID, PEOPLE_ID],
      });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
        fieldId: ORDERS.USER_ID,
      });
      H.DataModel.FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "People → ID")
        .click();
      H.popover().within(() => {
        cy.findByText("Reviews → ID").should("not.exist");
        cy.findByText("Products → ID").click();
      });
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Semantic type for User ID updated");
      H.DataModel.FieldSection.getSemanticTypeFkTarget()
        .should("have.value", "Products → ID")
        .and("be.visible");

      cy.signInAsNormalUser();
      H.openTable({
        database: SAMPLE_DB_ID,
        table: ORDERS_ID,
        mode: "notebook",
      });
      cy.icon("join_left_outer").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("User ID").should("be.visible");
    });

    it("should allow setting foreign key mapping for accessible tables", () => {
      setDataModelPermissions({
        tableIds: [ORDERS_ID, REVIEWS_ID, PRODUCTS_ID],
      });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.PRODUCT_ID,
      });

      H.DataModel.FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Use foreign key").click();
      H.popover().findByText("Title").click();
      cy.wait("@updateFieldDimension");

      cy.signInAsNormalUser();
      H.openReviewsTable({ limit: 1 });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Rustic Paper Wallet").should("be.visible");
    });

    it("should now allow setting foreign key mapping for inaccessible tables", () => {
      setDataModelPermissions({ tableIds: [REVIEWS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.PRODUCT_ID,
      });
      H.DataModel.FieldSection.getDisplayValuesInput().click();

      H.popover().within(() => {
        cy.findByRole("option", { name: /Use original value/ })
          .should("be.visible")
          .and("not.have.attr", "data-combobox-disabled");
        cy.findByRole("option", { name: /Use foreign key/ })
          .should("be.visible")
          .and("have.attr", "data-combobox-disabled", "true");
      });
    });

    it("should show a proper error message when using custom mapping", () => {
      setDataModelPermissions({ tableIds: [REVIEWS_ID] });

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.RATING,
      });
      H.DataModel.FieldSection.getDisplayValuesInput().click();

      H.popover().within(() => {
        cy.findByRole("option", { name: /Use original value/ })
          .should("be.visible")
          .and("not.have.attr", "data-combobox-disabled");
        cy.findByRole("option", { name: /Custom mapping/ })
          .should("be.visible")
          .and("have.attr", "data-combobox-disabled", "true");
      });

      cy.signInAsAdmin();
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.RATING,
      });
      H.DataModel.FieldSection.getDisplayValuesInput().click();
      H.popover().findByText("Custom mapping").click();
      cy.wait("@updateFieldDimension");

      cy.signIn("none");
      H.DataModel.visit({
        databaseId: SAMPLE_DB_ID,
        schemaId: SAMPLE_DB_SCHEMA_ID,
        tableId: REVIEWS_ID,
        fieldId: REVIEWS.RATING,
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(CUSTOM_MAPPING_ERROR).should("exist");
    });
  });

  describe("databases without schemas", { tags: ["@external"] }, () => {
    beforeEach(() => {
      H.restore("mysql-8");
      cy.signInAsAdmin();
    });

    it("should be able to select and update a table in a database without schemas", () => {
      H.DataModel.visit({
        databaseId: MYSQL_DB_ID,
        schemaId: MYSQL_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.getNameInput().clear().type("New orders").blur();
      cy.wait("@updateTable");

      H.undoToast().should("contain.text", "Table name updated");
      H.DataModel.TableSection.getNameInput().should(
        "have.value",
        "New orders",
      );
    });

    it("should be able to select and update a field in a database without schemas", () => {
      H.DataModel.visit({
        databaseId: MYSQL_DB_ID,
        schemaId: MYSQL_DB_SCHEMA_ID,
        tableId: ORDERS_ID,
      });

      H.DataModel.TableSection.clickField("Tax");
      H.DataModel.FieldSection.getVisibilityInput().click();
      H.popover().findByText("Do not include").click();
      cy.wait("@updateField");

      H.undoToast().should("contain.text", "Visibility for Tax updated");
      H.DataModel.FieldSection.getVisibilityInput().should(
        "have.value",
        "Do not include",
      );
    });
  });
});

const setDataModelPermissions = ({
  tableIds = [],
}: {
  tableIds: TableId[];
}) => {
  const permissions = Object.fromEntries(tableIds.map((id) => [id, "all"]));

  // @ts-expect-error invalid cy.updatePermissionsGraph typing
  cy.updatePermissionsGraph({
    [ALL_USERS_GROUP]: {
      [SAMPLE_DB_ID]: {
        "data-model": {
          schemas: {
            PUBLIC: permissions,
          },
        },
      },
    },
  });
};
