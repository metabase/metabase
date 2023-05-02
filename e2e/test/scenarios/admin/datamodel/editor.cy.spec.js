import {
  describeEE,
  openOrdersTable,
  popover,
  restore,
  startNewQuestion,
} from "e2e/support/helpers";
import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  USER_GROUPS,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;
const ORDERS_DESCRIPTION =
  "Confirmed Sample Company orders for a product, from a user.";
const MYSQL_BD_ID = SAMPLE_DB_ID + 1;

describe("scenarios > admin > datamodel > editor", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/database/*/schema/*").as("fetchTables");
    cy.intercept("GET", "/api/table/*/query_metadata*").as("fetchMetadata");
    cy.intercept("PUT", "/api/table").as("updateTables");
    cy.intercept("PUT", "/api/table/*").as("updateTable");
    cy.intercept("PUT", "/api/field/*").as("updateField");
    cy.intercept("PUT", "/api/table/*/fields/order").as("updateFieldOrder");
  });

  describe("table metadata", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should allow changing the table name", () => {
      visitOrdersTable();
      setValueAndBlurInput("Orders", "New orders");
      cy.wait("@updateTable");
      cy.findByText("Updated Table display_name");

      startNewQuestion();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("New orders").should("be.visible");
      });
    });

    it("should allow changing the table description", () => {
      visitOrdersTable();
      setValueAndBlurInput(ORDERS_DESCRIPTION, "New description");
      cy.wait("@updateTable");
      cy.findByText("Updated Table description");

      cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
      cy.findByText("Orders").should("be.visible");
      cy.findByText("New description").should("be.visible");
    });

    it("should allow clearing the table description", () => {
      visitOrdersTable();
      clearAndBlurInput(ORDERS_DESCRIPTION);
      cy.wait("@updateTable");
      cy.findByText("Updated Table description");

      cy.visit(`/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}`);
      cy.findByText("Orders").should("be.visible");
      cy.findByText("No description yet").should("be.visible");
    });

    it("should allow changing the table visibility", () => {
      visitOrdersTable();
      cy.findByText("Hidden").click();
      cy.wait("@updateTable");
      cy.findByText("Updated Table visibility_type");
      cy.findByText("5 Hidden Tables").should("be.visible");

      startNewQuestion();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("Orders").should("not.exist");
      });

      visitOrdersTable();
      cy.findByText("Queryable").click();
      cy.wait("@updateTable");
      cy.findByText("4 Hidden Tables").should("be.visible");

      startNewQuestion();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("Orders").should("be.visible");
      });
    });

    it("should allow changing the field name", () => {
      visitOrdersTable();
      getFieldSection("TAX").within(() =>
        setValueAndBlurInput("Tax", "New tax"),
      );
      cy.wait("@updateField");
      cy.findByText("Updated Tax").should("be.visible");

      openOrdersTable();
      cy.findByText("New tax").should("be.visible");
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field description", () => {
      visitOrdersTable();
      getFieldSection("TOTAL").within(() =>
        setValueAndBlurInput("The total billed amount.", "New description"),
      );
      cy.wait("@updateField");
      cy.findByText("Updated Total").should("be.visible");

      cy.visit(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
      );
      cy.findByText("Total").should("be.visible");
      cy.findByText("New description").should("be.visible");
    });

    it("should allow clearing the field description", () => {
      visitOrdersTable();
      getFieldSection("TOTAL").within(() =>
        clearAndBlurInput("The total billed amount."),
      );
      cy.wait("@updateField");
      cy.findByText("Updated Total").should("be.visible");

      cy.visit(
        `/reference/databases/${SAMPLE_DB_ID}/tables/${ORDERS_ID}/fields/${ORDERS.TOTAL}`,
      );
      cy.findByText("Total").should("be.visible");
      cy.findByText("No description yet").should("be.visible");
    });

    it("should allow changing the field visibility", () => {
      visitOrdersTable();
      getFieldSection("TAX").findByText("Everywhere").click();
      setSelectValue("Do not include");
      cy.wait("@updateField");
      cy.findByText("Updated Tax").should("be.visible");

      openOrdersTable();
      cy.findByText("Total").should("be.visible");
      cy.findByText("Tax").should("not.exist");
    });

    it("should allow changing the field semantic type and currency", () => {
      visitOrdersTable();
      getFieldSection("TAX").findByText("No semantic type").click();
      searchAndSelectValue("Currency");
      cy.wait("@updateField");
      cy.findByText("Updated Tax").should("be.visible");

      getFieldSection("TAX").findByText("US Dollar").click();
      searchAndSelectValue("Canadian Dollar");
      cy.wait("@updateField");

      openOrdersTable();
      cy.findByText("Tax (CA$)").should("be.visible");
    });

    it("should allow changing the field foreign key target", () => {
      visitOrdersTable();
      getFieldSection("USER_ID").findByText("People → ID").click();
      setSelectValue("Products → ID");
      cy.wait("@updateField");
      cy.findByText("Updated User ID").should("be.visible");

      startNewQuestion();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      cy.icon("join_left_outer").click();
      popover().within(() => {
        cy.findByText("Products").click();
      });
      cy.findByText("User ID").should("be.visible");
    });

    it("should allow sorting fields", () => {
      visitOrdersTable();

      cy.findByLabelText("Sort").click();
      popover().findByText("Alphabetical").click();
      cy.wait("@updateTable");

      moveField(3);
      cy.wait("@updateFieldOrder");

      openOrdersTable();
      cy.findAllByTestId("header-cell")
        .first()
        .should("have.text", "Product ID");
    });

    it("should allow hiding and restoring all tables in a schema", () => {
      visitOrdersTable();
      cy.findByText("4 Queryable Tables").should("be.visible");
      cy.findByLabelText("Hide all").click();
      cy.wait("@updateTables");

      visitOrdersTable();
      cy.findByText("8 Hidden Tables").should("be.visible");
      cy.findByLabelText("Unhide all").click();
      cy.wait("@updateTables");
      cy.findByText("8 Queryable Tables").should("be.visible");
    });
  });

  describe("field metadata", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should allow changing the field name", () => {
      visitOrdersQuantityField();
      setValueAndBlurInput("Quantity", "New quantity"), cy.wait("@updateField");
      cy.findByText("Updated Quantity").should("be.visible");

      openOrdersTable();
      cy.findByText("New quantity").should("be.visible");
      cy.findByText("Quantity").should("not.exist");
    });
  });

  describeEE("data model permissions", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP]: {
          [SAMPLE_DB_ID]: {
            "data-model": { schemas: { PUBLIC: { [ORDERS_ID]: "all" } } },
          },
        },
      });
    });

    it("should allow changing the table name with data model permissions only", () => {
      cy.signIn("none");
      visitOrdersTable();
      setValueAndBlurInput("Orders", "New orders");
      cy.wait("@updateTable");
      cy.findByText("Updated Table display_name");
      cy.signOut();

      cy.signInAsNormalUser();
      startNewQuestion();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("People").should("be.visible");
        cy.findByText("New orders").should("be.visible");
      });
    });

    it("should allow changing the field name with data model permissions only", () => {
      cy.signIn("none");
      visitOrdersTable();
      getFieldSection("TAX").within(() =>
        setValueAndBlurInput("Tax", "New tax"),
      );
      cy.wait("@updateField");
      cy.findByText("Updated New tax").should("be.visible");

      cy.signInAsNormalUser();
      openOrdersTable();
      cy.findByText("New tax").should("be.visible");
      cy.findByText("Tax").should("not.exist");
    });
  });

  describe("databases without schemas", { tags: ["@external"] }, () => {
    beforeEach(() => {
      restore("mysql-8");
      cy.signInAsAdmin();
    });

    it("should be able to select and update a table in a database without schemas", () => {
      visitOrdersTable(MYSQL_BD_ID);
      setValueAndBlurInput("Orders", "New orders");
      cy.wait("@updateTable");
    });

    it("should be able to select and update a field in a database without schemas", () => {
      visitOrdersTable(MYSQL_BD_ID);
      getFieldSection("TAX").findByText("Everywhere").click();
      setSelectValue("Do not include");
      cy.wait("@updateField");
    });
  });
});

const visitOrdersTable = (databaseId = SAMPLE_DB_ID) => {
  cy.visit(
    `/admin/datamodel/database/${databaseId}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}`,
  );
  cy.wait("@fetchMetadata");
};

const visitOrdersQuantityField = () => {
  cy.visit(
    `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${ORDERS_ID}/field/${ORDERS.QUANTITY}`,
  );
  cy.wait("@fetchMetadata");
};

const setValueAndBlurInput = (oldValue, newValue) => {
  cy.findByDisplayValue(oldValue).clear().type(newValue).blur();
};

const clearAndBlurInput = oldValue => {
  cy.findByDisplayValue(oldValue).clear().blur();
};

const setSelectValue = newValue => {
  popover().within(() => {
    cy.findByText(newValue).click();
  });
};

const searchAndSelectValue = (newValue, searchText = newValue) => {
  popover().within(() => {
    cy.findByRole("grid").scrollTo("top", { ensureScrollable: false });
    cy.findByPlaceholderText("Find...").type(searchText);
    cy.findByText(newValue).click();
  });
};

const getFieldSection = fieldName => {
  return cy.findByLabelText(fieldName);
};

const moveField = fieldIndex => {
  cy.get(".Grabber").eq(fieldIndex).trigger("mousedown", 0, 0);
  cy.get("#ColumnsList")
    .trigger("mousemove", 10, 10)
    .trigger("mouseup", 10, 10);
};
