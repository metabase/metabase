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
    createAndVisitLoremIpsumDocument();

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
      cy.get("body").click(0, 0);
      Comments.getDocumentNodeButton({ targetId, childTargetId }).should(
        "not.be.visible",
      );

      getNodeElement()
        .closest("[data-node-view-wrapper]")
        .should("have.attr", "aria-expanded", "false");
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

      cy.log("highlights related document node");
      getNodeElement()
        .closest("[data-node-view-wrapper]")
        .should("have.attr", "aria-expanded", "true");

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
      H.modal().should("not.exist");

      getNodeElement()
        .closest("[data-node-view-wrapper]")
        .should("have.attr", "aria-expanded", "false");

      cy.log("shows comments button when node has unresolved comments");
      Comments.getDocumentNodeButton({
        targetId,
        childTargetId,
        hasComments: true,
      }).should("be.visible");
    }
  });

  it("allows to split a paragraph in two, and then to comment on both paragraphs", () => {
    startNewCommentIn1ParagraphDocument();

    cy.get<DocumentId>("@documentId").then((targetId) => {
      cy.realType("Hello");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getNewThreadInput().within(() => {
        Comments.getPlaceholder().should("be.visible");
      });
      cy.findByLabelText("Close").click();

      H.documentContent().click();
      cy.realType("{leftarrow}".repeat("lor sit amet.".length));
      cy.realType("{enter}");
      cy.findByRole("button", { name: "Save" }).click();
      cy.findByRole("button", { name: "Save" }).should("not.exist");

      Comments.getDocumentNodeButton({
        targetId,
        childTargetId: PARAGRAPH_ID,
        hasComments: true,
      }).should("be.visible");

      Comments.getDocumentNodeButtons()
        .filter(":visible")
        .should("have.length", 1);
      getParagraph("lor sit amet.").realHover();
      Comments.getDocumentNodeButtons()
        .filter(":visible")
        .should("have.length", 2)
        .last()
        .should("not.contain.text", "1")
        .click();

      H.modal().within(() => {
        cy.findByRole("heading", { name: "Comments" }).should("be.visible");
        cy.findByText("Hello").should("not.exist");
      });
    });
  });

  it("upgrades existing documents without _id attribute", () => {
    H.createDocument({
      idAlias: "documentId",
      name: "Lorem ipsum",
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            /* Intentionally commented out: */
            // attrs: {
            //   _id: PARAGRAPH_ID,
            // },
            content: [
              {
                type: "text",
                text: "Lorem ipsum dolor sit amet.",
              },
            ],
          },
        ],
      },
    });
    H.visitDocument("@documentId");
    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.visible")
      .and("have.value", "Lorem ipsum");

    cy.log("document is dirty after schema migration");
    cy.findByRole("button", { name: "Save" }).should("be.visible").click();
    cy.findByRole("button", { name: "Save" }).should("not.exist");

    cy.reload();

    cy.log("document is not dirty after persisting the missing _id");
    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.visible")
      .and("have.value", "Lorem ipsum");
    cy.findByRole("button", { name: "Save" }).should("not.exist");
  });

  it("allows to create / update / delete comments", () => {
    startNewCommentIn1ParagraphDocument();

    H.modal().within(() => {
      cy.log("does not allow to send empty comments");
      cy.realPress([META_KEY, "Enter"]);
      cy.findByLabelText("Send").should("be.disabled");
      Comments.getCommentInput().should("not.exist");

      cy.log("allows to start threads and add replies with keyboard shortcut");
      Comments.getNewThreadInput().click();
      cy.realType("1st thread");
      cy.realPress([META_KEY, "Enter"]);
      cy.findAllByText("a few seconds ago")
        .should("be.visible")
        .and("have.length", 1);

      Comments.getCommentInputs().should("have.length", 2).last().click();
      cy.realType("Reply 1");
      cy.realPress([META_KEY, "Enter"]);
      cy.findAllByText("a few seconds ago")
        .should("be.visible")
        .and("have.length", 2);

      Comments.getCommentInputs().should("have.length", 3).last().click();
      cy.realType("Reply 2");
      cy.realPress([META_KEY, "Enter"]);

      cy.log("allows to start threads and add replies with the button");
      Comments.getNewThreadInput().click();
      cy.realType("2nd thread");
      cy.findAllByLabelText("Send").should("have.length", 2).last().click();

      Comments.getCommentInputs().should("have.length", 6).last().click();
      cy.realType("Reply A");
      cy.findAllByLabelText("Send").should("have.length", 3).eq(1).click();

      Comments.getCommentInputs().should("have.length", 7).last().click();
      cy.realType("Reply B");
      cy.findAllByLabelText("Send").should("have.length", 3).eq(1).click();

      cy.log("allows to delete a comment");
      Comments.getCommentByText("Reply A").realHover();
      Comments.getCommentByText("Reply A")
        .findByLabelText("More actions")
        .click();
    });

    H.popover().findByText("Delete").click();

    H.modal().within(() => {
      cy.findByText("Reply A").should("not.exist");
      cy.findByText("This comment was deleted.").should("not.exist");

      cy.log("allows to delete a comment that starts a thread");
      Comments.getCommentByText("1st thread").realHover();
      Comments.getCommentByText("1st thread")
        .findByLabelText("More actions")
        .click();
    });

    H.popover().findByText("Delete").click();

    H.modal().within(() => {
      cy.findByText("1st thread").should("not.exist");
      cy.findByText("This comment was deleted.").should("be.visible");
      cy.findByText("Reply 1").should("be.visible");
      cy.findByText("Reply 2").should("be.visible");

      cy.log("allows to edit a comment");
      Comments.getCommentByText("Reply 1").realHover();
      Comments.getCommentByText("Reply 1")
        .findByLabelText("More actions")
        .click();
    });

    H.popover().findByText("Edit").click();
    cy.log("editor should be autofocused when editing");
    cy.realType("My ");
    cy.realPress([META_KEY, "Enter"]);

    H.modal().within(() => {
      Comments.getCommentByText("My Reply 1").should("be.visible");
      Comments.getCommentByText("My Reply 1")
        .findByRole("textbox")
        .should("have.attr", "contenteditable", "false");

      cy.log("allows to cancel editing a comment with Esc");
      Comments.getCommentByText("Reply 2").realHover();
      Comments.getCommentByText("Reply 2")
        .findByLabelText("More actions")
        .click();
    });

    H.popover().findByText("Edit").click();
    Comments.getCommentByText("Reply 2")
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "true");

    cy.realPress("Escape");
    Comments.getCommentByText("Reply 2")
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "false");
    H.modal().should("be.visible");

    cy.log("subsequent Esc should close the modal");
    cy.realPress("Escape");
    H.modal().should("not.exist");
  });

  describe("comment editor", () => {
    it("supports basic formatting with markdown", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("**bold** *italic* ~~strike~~ `code`");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getCommentInputs()
        .first()
        .within(() => {
          cy.get("strong").should("have.text", "bold");
          cy.get("em").should("have.text", "italic");
          cy.get("s").should("have.text", "strike");
          cy.get("code").should("have.text", "code");
        });
    });

    it("supports mentions and can mention yourself", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("@");
      H.documentSuggestionDialog().within(() => {
        cy.findByText("Lorem ipsum").should("be.visible");
        cy.findByText("First collection").should("be.visible");
        cy.findByText("Browse all").should("be.visible");
        cy.findByText("Bobby Tables").should("not.exist");
      });

      cy.realType("tAbLe");
      H.documentSuggestionDialog().within(() => {
        cy.findByText("Lorem ipsum").should("not.exist");
        cy.findByText("Bobby Tables").should("be.visible");
        cy.findByText("No Collection Tableton").should("be.visible");
        cy.findByText("Most viewed content").should("be.visible");
      });

      cy.realType("s");
      H.documentSuggestionDialog().within(() => {
        cy.findByText("Bobby Tables").should("be.visible");
        cy.findByText("Bobby Tables's Personal Collection").should(
          "be.visible",
        );
        cy.findByText("No Collection Tableton").should("not.exist");
      });

      cy.realPress("Enter");
      H.documentSuggestionDialog().should("not.exist");

      cy.log("closes suggestion dialog but not the comments modal on Esc");
      cy.realType(" @no");
      H.documentSuggestionDialog().should("be.visible");
      cy.realPress("Escape");
      H.documentSuggestionDialog().should("not.exist");
      H.modal().should("be.visible");

      cy.realType("{backspace}{backspace}{backspace}@none");
      H.documentSuggestionDialog().findByText("None Tableton").click();

      H.modal().within(() => {
        Comments.getNewThreadInput()
          .findByText("@Bobby Tables")
          .should("be.visible");
        Comments.getNewThreadInput()
          .findByText("@None Tableton")
          .should("be.visible");

        cy.realPress([META_KEY, "Enter"]);

        cy.findByText("a few seconds ago").should("be.visible");
        cy.findByText("@Bobby Tables").should("be.visible");
        cy.findByText("@None Tableton").should("be.visible");
      });
    });

    it("supports emojis", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType(":s");
      Comments.getEmojiPicker()
        .should("be.visible")
        .and("contain.text", "😄")
        .and("contain.text", "💦");

      cy.log("can filter emojis");
      cy.realType("mile");
      Comments.getEmojiPicker()
        .should("be.visible")
        .and("contain.text", "😄")
        .and("not.contain.text", "💦");

      cy.log("can use arrow keys for navigation within the emoji picker");
      cy.realPress("Tab"); // TODO: remove this, this is bug #26
      cy.realPress("ArrowDown");
      cy.realPress("ArrowRight");
      cy.realPress("Enter");

      Comments.getEmojiPicker().should("not.exist");

      cy.log("can submit first suggestion with Enter");
      cy.realType(":eggplant{enter}");

      cy.log("closes suggestion dialog but not the comments modal on Esc");
      cy.realType(":eg");
      cy.realPress("Escape");
      Comments.getEmojiPicker().should("not.exist");
      H.modal().should("be.visible");

      cy.log("can use mouse to select emoji");
      cy.realType("{backspace}{backspace}{backspace}:egg");
      Comments.getEmojiPicker().findByText("🥚").click();

      H.modal().within(() => {
        Comments.getNewThreadInput()
          .should("contain.text", "😊")
          .and("contain.text", "🍆")
          .and("contain.text", "🥚");

        cy.realPress([META_KEY, "Enter"]);

        cy.contains("😊").should("be.visible");
        cy.contains("🍆").should("be.visible");
        cy.contains("🥚").should("be.visible");
      });
    });
  });
});

function startNewCommentIn1ParagraphDocument() {
  create1AndVisitParagraphDocument();
  getParagraph().realHover();

  cy.get<DocumentId>("@documentId").then((targetId) => {
    Comments.getDocumentNodeButton({
      targetId,
      childTargetId: PARAGRAPH_ID,
    })
      .should("be.visible")
      .click();
  });

  H.modal().within(() => {
    cy.findByRole("heading", { name: "Comments" }).should("be.visible");
    Comments.getNewThreadInput().click();
  });
}

function createAndVisitLoremIpsumDocument() {
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

function create1AndVisitParagraphDocument() {
  H.createDocument({
    idAlias: "documentId",
    name: "Lorem ipsum",
    document: {
      type: "doc",
      content: [
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
      ],
    },
  });
  H.visitDocument("@documentId");
  cy.findByRole("textbox", { name: "Document Title" })
    .should("be.visible")
    .and("have.value", "Lorem ipsum");
}

function getHeading1(name = "Heading 1") {
  return H.documentContent().findByRole("heading", {
    name,
    level: 1,
  });
}

function getHeading2(name = "Heading 2") {
  return H.documentContent().findByRole("heading", {
    name,
    level: 2,
  });
}

function getHeading3(name = "Heading 3") {
  return H.documentContent().findByRole("heading", {
    name,
    level: 3,
  });
}

function getParagraph(text = "Lorem ipsum dolor sit amet.") {
  return H.documentContent().findByText(text).parent();
}

function getBulletList(text = "Bullet A") {
  return H.documentContent().findByText(text).closest("ul");
}

function getBlockquote(text = "A famous quote") {
  return H.documentContent().findByText(text).closest("blockquote");
}

function getOrderedList(text = "Item 1") {
  return H.documentContent().findByText(text).closest("ol");
}

function getCodeBlock(text = "while (true) {}") {
  return H.documentContent().findByText(text).closest("pre");
}

function getEmbed() {
  return H.documentContent().findByTestId("document-card-embed");
}
