const { H } = cy;

import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { DocumentId } from "metabase-types/api";

const DOCUMENT_NAME = "Quarterly review";
const NEW_DOCUMENT_NAME = "Launch notes";
const PARAGRAPH_TEXT = "Revenue grew this quarter";
const QUESTION_NAME = "Orders";

const documentsPage = () => cy.findByTestId("library-page");
const documentHeader = () => cy.findByTestId("document-pane-header");

function createLibraryDocumentWithQuestion() {
  H.createLibrarySection("library-documents").then((documentsCollection) => {
    H.createDocument({
      name: DOCUMENT_NAME,
      collection_id: documentsCollection.id,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { _id: "1" },
            content: [{ type: "text", text: PARAGRAPH_TEXT }],
          },
          {
            type: "resizeNode",
            attrs: { height: 400, minHeight: 280 },
            content: [
              {
                type: "cardEmbed",
                attrs: { id: ORDERS_QUESTION_ID, name: null, _id: "2" },
              },
            ],
          },
          { type: "paragraph", attrs: { _id: "3" } },
        ],
      },
      idAlias: "documentId",
    });
  });
}

describe("scenarios > data studio > documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
  });

  it("creates a document from the New menu and lists it after returning from the editor", () => {
    H.createLibrary();
    cy.intercept("POST", "/api/document").as("createDocument");

    H.DataStudio.visit();
    H.DataStudio.nav().findByRole("link", { name: "Documents" }).click();
    cy.location("pathname").should("eq", "/data-studio/documents");

    cy.log("The New menu offers a document and a collection");
    documentsPage().findByRole("button", { name: /New/ }).click();
    H.popover()
      .findByRole("menuitem", { name: /Collection$/ })
      .should("be.visible");
    H.popover()
      .findByRole("menuitem", { name: /Document$/ })
      .click();

    cy.log("The modal creates the document in the Documents collection");
    cy.findByRole("dialog", { name: "New document" }).within(() => {
      cy.findByLabelText("Collection").should("contain", "Documents");
      cy.findByLabelText("Name").type(NEW_DOCUMENT_NAME);
      cy.findByRole("button", { name: "Create" }).click();
    });

    cy.wait("@createDocument").then(({ response }) => {
      const documentId: DocumentId = response?.body.id;
      cy.location("pathname").should("eq", `/document/${documentId}`);
    });
    cy.findByRole("textbox", { name: "Document Title" }).should(
      "have.value",
      NEW_DOCUMENT_NAME,
    );
    H.documentContent().should("be.visible");

    cy.log("Going back shows the new document in the list");
    cy.go("back");
    cy.location("pathname").should("eq", "/data-studio/documents");
    documentsPage()
      .findByRole("link", { name: new RegExp(NEW_DOCUMENT_NAME) })
      .should("be.visible");
  });

  it("shows a Library document's overview, contents, and history, and links to and from the editor", () => {
    createLibraryDocumentWithQuestion();

    cy.get<DocumentId>("@documentId").then((documentId) => {
      const overviewPath = `/data-studio/documents/${documentId}`;

      cy.visit("/data-studio/documents");
      documentsPage()
        .findByRole("link", { name: new RegExp(DOCUMENT_NAME) })
        .click();

      cy.location("pathname").should("eq", overviewPath);
      documentHeader().should("contain", DOCUMENT_NAME);
      cy.findByTestId("document-preview")
        .should("contain", PARAGRAPH_TEXT)
        .findByTestId("card-embed-title")
        .should("have.text", QUESTION_NAME);
      cy.findByTestId("document-info")
        .should("contain", "Owner")
        .and("contain", "Bobby Tables")
        .and("contain", "Views");

      cy.log("Contents lists the question saved inside the document");
      documentHeader().findByRole("link", { name: "Contents" }).click();
      cy.location("pathname").should("eq", `${overviewPath}/contents`);
      cy.findByTestId("document-contents-page")
        .findByRole("row", { name: new RegExp(QUESTION_NAME) })
        .should("be.visible")
        .and("contain", "Question")
        .and("contain", DOCUMENT_NAME)
        .findByTestId("content-name")
        .should("have.text", QUESTION_NAME);

      cy.log("History starts with the creation of the document");
      documentHeader().findByRole("link", { name: "History" }).click();
      cy.location("pathname").should("eq", `${overviewPath}/history`);
      cy.findByTestId("document-history-page").should(
        "contain",
        "created this document",
      );

      cy.log("Open goes to the editor and its menu leads back here");
      documentHeader()
        .findByRole("link", { name: /Open/ })
        .should("have.attr", "target", "_blank")
        .invoke("removeAttr", "target")
        .click();
      cy.location("pathname").should("eq", `/document/${documentId}`);
      H.documentContent().should("contain", PARAGRAPH_TEXT);
      cy.findByRole("button", { name: "More options" }).click();
      H.popover()
        .findByRole("menuitem", { name: /Open in Data Studio/ })
        .click();

      cy.location("pathname").should("eq", overviewPath);
      cy.findByTestId("document-overview-page").should("be.visible");
    });
  });
});
