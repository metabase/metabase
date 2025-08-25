import type { CardId, TableId } from "metabase-types/api";

export const DetailView = {
  visitModel,
  visitTable,
  getObjectDetails,
  getRelationships,
  verifyObjectDetails,
};

function visitModel(modelIdOrSlug: CardId | string, rowId: string | number) {
  cy.visit(`/model/${modelIdOrSlug}/detail/${rowId}`);
}

function visitTable(tableId: TableId, rowId: string | number) {
  cy.visit(`/table/${tableId}/detail/${rowId}`);
  cy.findByTestId("loading-indicator").should("be.visible");
  cy.wait("@tableMetadata");
  cy.findByTestId("loading-indicator").should("not.exist");
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
