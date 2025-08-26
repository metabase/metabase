import type { CardId, TableId } from "metabase-types/api";

export const DetailView = {
  visitModel,
  visitTable,
  getHeader,
  getDetails,
  getDetailsRow,
  getDetailsRowColumnName,
  getDetailsRowValue,
  getRelationships,
  verifyDetails,
};

interface RowOptions {
  index: number;
  rowsCount: number;
}

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

function getHeader() {
  return cy.findByTestId("detail-view-header");
}

function getDetails() {
  return cy.findByTestId("object-details");
}

function getDetailsRow({ index, rowsCount }: RowOptions) {
  return getDetails()
    .findAllByTestId("object-details-row")
    .should("have.length", rowsCount)
    .eq(index);
}

function getDetailsRowColumnName({ index, rowsCount }: RowOptions) {
  return getDetailsRow({ index, rowsCount }).findByTestId("column-name");
}

function getDetailsRowValue({ index, rowsCount }: RowOptions) {
  return getDetailsRow({ index, rowsCount }).findByTestId("value");
}

function getRelationships() {
  return cy.findByTestId("relationships");
}

function verifyDetails(rows: [string, string][]) {
  getDetails().within(() => {
    cy.findAllByTestId("object-details-row").should("have.length", rows.length);

    for (let index = 0; index < rows.length; ++index) {
      const [column, value] = rows[index];

      cy.findAllByTestId("object-details-row")
        .should("have.length", rows.length)
        .eq(index)
        .findByTestId("column-name")
        .should("have.text", column);

      cy.findAllByTestId("object-details-row")
        .should("have.length", rows.length)
        .eq(index)
        .findByTestId("value")
        .should("have.text", value);
    }
  });
}
