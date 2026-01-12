import type {
  Card,
  CardId,
  Document,
  DocumentContent,
  RegularCollectionId,
} from "metabase-types/api";

export const createDocument = ({
  name,
  collection_id,
  document,
  cards,
  alias,
  idAlias,
}: {
  name: string;
  collection_id?: RegularCollectionId | null;
  document: DocumentContent;
  cards?: Record<CardId, Card>;
  alias?: string;
  idAlias?: string;
}): Cypress.Chainable<Cypress.Response<Document>> => {
  cy.log(`Create a document: ${name}`);

  return cy
    .request("POST", "/api/document", {
      name,
      collection_id,
      document,
      cards,
    })
    .then((response) => {
      if (alias) {
        cy.wrap(response.body).as(alias);
      }
      if (idAlias) {
        cy.wrap(response.body.id).as(idAlias);
      }
    });
};
