import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type { DocumentId } from "metabase-types/api";

const { H } = cy;
const { Comments } = H;

const IS_MAC = Cypress.platform === "darwin";
const META_KEY = IS_MAC ? "Meta" : "Control";

const HEADING_1_ID = "c2187a62-1093-61ee-3174-0bbe64c8bbfa";
const HEADING_2_ID = "82999d0b-d7a7-c0f8-aedf-6ddf737edf78";
const HEADING_3_ID = "190b1dd2-d875-18ae-0ba0-a13c91630c2b";
const PARAGRAPH_ID = "b7fa322a-964e-d668-8d30-c772ef4f0022";
const BULLET_LIST_ID = "3fd94c59-614d-bce7-37ef-c2f46871679a";
const BLOCKQUOTE_ID = "e785b000-1651-c154-e0bd-7313f839bb50";
const ORDERED_LIST_ID = "12fd2bdb-76f7-d07a-b61e-b2d2eee127b5";
const CODE_BLOCK_ID = "b9fec4be-4b44-2c24-7073-10f23522cfd3";
const CARD_EMBED_ID = "cce109c3-4cec-caf1-a569-89fa15410ae1";

H.describeWithSnowplowEE("document comments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resetSnowplow();
  });

  it("allows to comment on every type of node", () => {
    createLoremIpsumDocument();

    cy.log("does not need schema adjustments by default");
    cy.findByRole("button", { name: "Save" }).should("not.exist");

    cy.log("does not have any comments by default");
    cy.findByRole("link", { name: "All comments" }).should("not.exist");

    cy.get<DocumentId>("@documentId").then((documentId) => {
      testCommentingOnNode(documentId, HEADING_1_ID, getHeading1);
      testCommentingOnNode(documentId, HEADING_2_ID, getHeading2);
      testCommentingOnNode(documentId, HEADING_3_ID, getHeading3);
      testCommentingOnNode(documentId, PARAGRAPH_ID, getParagraph);
      testCommentingOnNode(documentId, BULLET_LIST_ID, getBulletList);
      testCommentingOnNode(documentId, BLOCKQUOTE_ID, getBlockquote);
      testCommentingOnNode(documentId, ORDERED_LIST_ID, getOrderedList);
      testCommentingOnNode(documentId, CODE_BLOCK_ID, getCodeBlock);
      testCommentingOnNode(documentId, CARD_EMBED_ID, getEmbed);
    });

    function testCommentingOnNode<E extends HTMLElement>(
      targetId: DocumentId,
      childTargetId: string,
      getNodeElement: () => Cypress.Chainable<JQuery<E>>,
    ) {
      Comments.getDocumentNodeButton({ targetId, childTargetId }).should(
        "not.be.visible",
      );

      getNodeElement().scrollIntoView();
      getNodeElement().realHover();
      Comments.getDocumentNodeButton({ targetId, childTargetId })
        .should("be.visible")
        .click();

      H.modal().within(() => {
        cy.findByRole("heading", { name: "Comments" }).should("be.visible");

        Comments.getNewThreadInput().click();
        cy.realType("Hello");
        cy.realPress([META_KEY, "Enter"]);
        Comments.getNewThreadInput().within(() => {
          Comments.getPlaceholder().should("be.visible");
        });
      });

      cy.log("shows comments button when comments for the node are open");
      Comments.getDocumentNodeButton({
        targetId,
        childTargetId,
        hasComments: true,
      })
        .should("be.visible")
        .and("contain.text", "1");

      cy.log("can close the sidebar with a keyboard shortcut");
      cy.realPress("Escape");
      cy.realPress("Escape"); // TODO: remove this, this is because of a bug #21
      H.modal().should("not.exist");

      cy.log("shows comments button when node has unresolved comments");
      Comments.getDocumentNodeButton({
        targetId,
        childTargetId,
        hasComments: true,
      }).should("be.visible");
    }
  });
});

function createLoremIpsumDocument() {
  H.createDocument({
    idAlias: "documentId",
    name: "Lorem ipsum",
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
            _id: HEADING_1_ID,
          },
          content: [
            {
              type: "text",
              text: "Heading 1",
            },
          ],
        },
        {
          type: "heading",
          attrs: {
            level: 2,
            _id: HEADING_2_ID,
          },
          content: [
            {
              type: "text",
              text: "Heading 2",
            },
          ],
        },
        {
          type: "heading",
          attrs: {
            level: 3,
            _id: HEADING_3_ID,
          },
          content: [
            {
              type: "text",
              text: "Heading 3",
            },
          ],
        },
        {
          type: "paragraph",
          attrs: {
            _id: PARAGRAPH_ID,
          },
          content: [
            {
              type: "text",
              text: "Lorem ipsum dolor sit amet.",
            },
          ],
        },
        {
          type: "bulletList",
          attrs: {
            _id: BULLET_LIST_ID,
          },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "d89a509c-0a03-3856-8e10-481a58797df1",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Bullet A",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "4080cc00-a884-af5d-8863-643a9490d5ae",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Bullet B",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "f2cb1cfe-5d39-f733-9122-bb5e5f876c17",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Bullet C",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          attrs: {
            _id: BLOCKQUOTE_ID,
          },
          content: [
            {
              type: "paragraph",
              attrs: {
                _id: "0c48f302-cb8d-ca5b-9c6f-32a7b3723c53",
              },
              content: [
                {
                  type: "text",
                  text: "A famous quote",
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          attrs: {
            start: 1,
            type: null,
            _id: ORDERED_LIST_ID,
          },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "1b044a62-221e-0ee9-f68f-3a8e026c073d",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Item 1",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "53cb6ee7-6012-2fd6-61e1-5a4a22ba38d0",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Item 2",
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: {
                    _id: "a3ba73b9-4f43-e1f6-4867-832fa0dc2df1",
                  },
                  content: [
                    {
                      type: "text",
                      text: "Item 3",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: {
            language: null,
            _id: CODE_BLOCK_ID,
          },
          content: [
            {
              type: "text",
              text: "while (true) {}",
            },
          ],
        },
        {
          type: "cardEmbed",
          attrs: {
            id: ORDERS_QUESTION_ID,
            name: null,
            _id: CARD_EMBED_ID,
          },
        },
        {
          type: "paragraph",
          attrs: {
            _id: "b0ab4c7e-7802-c6f7-2708-0f63bdd0b129",
          },
        },
      ],
    },
  });

  H.visitDocument("@documentId");
  cy.findByRole("textbox", { name: "Document Title" })
    .should("be.visible")
    .and("have.value", "Lorem ipsum");
}

function getHeading1() {
  return H.documentContent().findByRole("heading", {
    name: "Heading 1",
    level: 1,
  });
}

function getHeading2() {
  return H.documentContent().findByRole("heading", {
    name: "Heading 2",
    level: 2,
  });
}

function getHeading3() {
  return H.documentContent().findByRole("heading", {
    name: "Heading 3",
    level: 3,
  });
}

function getParagraph() {
  return H.documentContent().findByText("Lorem ipsum dolor sit amet.");
}

function getBulletList() {
  return H.documentContent().findByText("Bullet A").closest("ul");
}

function getBlockquote() {
  return H.documentContent()
    .findByText("A famous quote")
    .closest("[data-node-view-wrapper]");
}

function getOrderedList() {
  return H.documentContent().findByText("Item 1").closest("ol");
}

function getCodeBlock() {
  return H.documentContent().findByText("while (true) {}");
}

function getEmbed() {
  return H.documentContent().findByTestId("document-card-embed");
}
