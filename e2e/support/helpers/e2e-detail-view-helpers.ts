import type { CardId, TableId } from "metabase-types/api";

export const DetailView = {
  visitModel,
  visitTable,
  getObjectDetails,
  getRelationships,
  verifyObjectDetails,
};

function visitModel(modelIdOrSlug: CardId | string, rowId: string | number) {
  cy.intercept("GET", "/api/card/*/query_metadata*").as(
    "modelDetailTableMetadata",
  );
  cy.visit(`/model/${modelIdOrSlug}/detail/${rowId}`);
  cy.wait("@modelDetailTableMetadata");
}

function visitTable(tableId: TableId, rowId: string | number) {
  cy.intercept("GET", "/api/table/*/query_metadata*").as(
    "tableDetailTableMetadata",
  );
  cy.visit(`/table/${tableId}/detail/${rowId}`);
  cy.wait("@tableDetailTableMetadata");
}

function getRelationships() {
  return cy.findByTestId("relationships");
}

function getObjectDetails() {
  return cy.findByTestId("object-details");
}

function verifyObjectDetails(rows: [string, string][]) {
  getObjectDetails().within(() => {
    cy.findAllByTestId("object-details-row").should("have.length", rows.length);

    for (let index = 0; index < rows.length; ++index) {
      const [column, value] = rows[index];

      cy.findAllByTestId("object-details-row")
        .should("have.length", rows.length)
        .eq(index)
        .findByTestId("column")
        .should("have.text", column);

      cy.findAllByTestId("object-details-row")
        .should("have.length", rows.length)
        .eq(index)
        .findByTestId("value")
        .should("have.text", value);
    }
  });
}
