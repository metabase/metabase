import {
  NORMAL_USER_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { deleteComment } from "e2e/support/helpers";
import { uuid } from "metabase/lib/uuid";
import type { CommentId, DocumentId } from "metabase-types/api";

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
const FIRST_REACTION_EMOJI = "😀";
const SECOND_REACTION_EMOJI = "😃";

describe("document comments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
  });

  it("allows to comment on every type of node", () => {
    createAndVisitLoremIpsumDocument();

    cy.log("does not need schema adjustments by default");
    cy.findByRole("button", { name: "Save" }).should("not.exist");

    cy.log("does not have any comments by default");
    cy.findByRole("link", { name: "All comments" }).should("not.exist");

    cy.get<DocumentId>("@documentId").then((documentId) => {
      testCommentingOnNode(documentId, HEADING_1_ID, H.getHeading1);
      testCommentingOnNode(documentId, HEADING_2_ID, H.getHeading2);
      testCommentingOnNode(documentId, HEADING_3_ID, H.getHeading3);
      testCommentingOnNode(documentId, PARAGRAPH_ID, H.getParagraph);
      testCommentingOnNode(documentId, BULLET_LIST_ID, H.getBulletList);
      testCommentingOnNode(documentId, BLOCKQUOTE_ID, H.getBlockquote);
      testCommentingOnNode(documentId, ORDERED_LIST_ID, H.getOrderedList);
      testCommentingOnNode(documentId, CODE_BLOCK_ID, H.getCodeBlock);
      testCommentingOnNode(documentId, CARD_EMBED_ID, H.getEmbed, {
        isCardEmbedNode: true,
      });
    });

    function testCommentingOnNode<E extends HTMLElement>(
      targetId: DocumentId,
      childTargetId: string,
      getNodeElement: () => Cypress.Chainable<JQuery<E>>,
      { isCardEmbedNode = false } = {},
    ) {
      cy.get("body").click(0, 0);

      if (isCardEmbedNode) {
        getNodeElement().scrollIntoView();
        getNodeElement().icon("ellipsis").click();

        H.menu().findByText("Comment").click();
      } else {
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
      }

      Comments.getSidebar().within(() => {
        cy.findByRole("heading", { name: "Comments about this" }).should(
          "be.visible",
        );

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
        isCardEmbedNode,
      })
        .should("be.visible")
        .and("contain.text", "1");

      cy.log("can close the sidebar with a keyboard shortcut");
      cy.realPress("Escape");
      Comments.getSidebar().should("not.exist");

      getNodeElement()
        .closest("[data-node-view-wrapper]")
        .should("have.attr", "aria-expanded", "false");

      cy.log("shows comments button when node has unresolved comments");
      Comments.getDocumentNodeButton({
        targetId,
        childTargetId,
        hasComments: true,
        isCardEmbedNode,
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
      Comments.closeSidebar();

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
      H.getParagraph("lor sit amet.").realHover();
      Comments.getDocumentNodeButtons()
        .filter(":visible")
        .should("have.length", 2)
        .last()
        .should("not.contain.text", "1")
        .click();

      Comments.getSidebar().within(() => {
        cy.findByRole("heading", { name: "Comments about this" }).should(
          "be.visible",
        );
        cy.findByText("Hello").should("not.exist");
      });
    });
  });

  it("upgrades existing documents without _id attributes in nodes that support comments", () => {
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

    Comments.getSidebar().within(() => {
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

    Comments.getSidebar().within(() => {
      cy.findByText("Reply A").should("not.exist");
      cy.findByText("This comment was deleted.").should("not.exist");

      cy.log("allows to delete a comment that starts a thread");
      Comments.getCommentByText("1st thread").realHover();
      Comments.getCommentByText("1st thread")
        .findByLabelText("More actions")
        .click();
    });

    H.popover().findByText("Delete").click();

    Comments.getSidebar().within(() => {
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

    Comments.getSidebar().within(() => {
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
    Comments.getSidebar().should("be.visible");

    cy.log("subsequent Esc should close the modal");
    cy.realPress("Escape");
    Comments.getSidebar().should("not.exist");
  });

  it("shows comment button with unresolved, undeleted comments count", () => {
    create1ParagraphDocument();

    cy.get<DocumentId>("@documentId").then((documentId) => {
      cy.log("3-comments thread with 1st comment deleted");
      createComment("Test 1").then(({ body: rootComment }) => {
        createComment("Test 2", rootComment.id);
        createComment("Test 3", rootComment.id);
        deleteComment(rootComment.id);
      });

      cy.log("3-comments thread with 2nd comment deleted");
      createComment("Test A").then(({ body: rootComment }) => {
        createComment("Test B", rootComment.id).then(({ body: comment }) => {
          deleteComment(comment.id);
        });
        createComment("Test C", rootComment.id);
      });

      cy.log("resolved 3-comments thread with 1st comment deleted");
      createComment("Test I").then(({ body: rootComment }) => {
        createComment("Test II", rootComment.id);
        createComment("Test III", rootComment.id);
        deleteComment(rootComment.id);
        H.updateComment({ id: rootComment.id, is_resolved: true });
      });

      cy.log("3-comments thread with all comments deleted");
      createComment("Test X").then(({ body: rootComment }) => {
        createComment("Test Y", rootComment.id).then(({ body: comment }) => {
          deleteComment(comment.id);
        });
        createComment("Test Z", rootComment.id).then(({ body: comment }) => {
          deleteComment(comment.id);
        });
        deleteComment(rootComment.id);
      });

      cy.log("resolved 3-comments thread with all comments deleted");
      createComment("Test D").then(({ body: rootComment }) => {
        createComment("Test E", rootComment.id).then(({ body: comment }) => {
          deleteComment(comment.id);
        });
        createComment("Test F", rootComment.id).then(({ body: comment }) => {
          deleteComment(comment.id);
        });
        H.updateComment({ id: rootComment.id, is_resolved: true });
        deleteComment(rootComment.id);
      });

      function createComment(
        text: string,
        parent_comment_id: CommentId | null = null,
      ) {
        return createParagraphComment(documentId, text, parent_comment_id);
      }
    });

    H.visitDocument("@documentId");
    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.visible")
      .and("have.value", "Lorem ipsum");

    cy.get<DocumentId>("@documentId").then((targetId) => {
      Comments.getDocumentNodeButton({
        targetId,
        childTargetId: PARAGRAPH_ID,
        hasComments: true,
      })
        .should("be.visible")
        .and("have.text", "4")
        .click();
    });

    Comments.getSidebar().within(() => {
      cy.findByRole("heading", { name: "Comments about this" }).should(
        "be.visible",
      );

      cy.findByText("Test 1").should("not.exist");
      cy.findByText("Test 2").should("be.visible");
      cy.findByText("Test 3").should("be.visible");

      cy.findByText("Test A").should("be.visible");
      cy.findByText("Test B").should("not.exist");
      cy.findByText("Test C").should("be.visible");

      cy.findByText("Test I").should("not.exist");
      cy.findByText("Test II").should("not.exist");
      cy.findByText("Test III").should("not.exist");

      cy.findByText("Test X").should("not.exist");
      cy.findByText("Test Y").should("not.exist");
      cy.findByText("Test Z").should("not.exist");

      cy.findByText("Test D").should("not.exist");
      cy.findByText("Test E").should("not.exist");
      cy.findByText("Test F").should("not.exist");

      cy.findByRole("tab", { name: "Resolved (2)" }).click();

      cy.findByText("Test 1").should("not.exist");
      cy.findByText("Test 2").should("not.exist");
      cy.findByText("Test 3").should("not.exist");

      cy.findByText("Test A").should("not.exist");
      cy.findByText("Test B").should("not.exist");
      cy.findByText("Test C").should("not.exist");

      cy.findByText("Test I").should("not.exist");
      cy.findByText("Test II").should("be.visible");
      cy.findByText("Test III").should("be.visible");

      cy.findByText("Test X").should("not.exist");
      cy.findByText("Test Y").should("not.exist");
      cy.findByText("Test Z").should("not.exist");

      cy.findByText("Test D").should("not.exist");
      cy.findByText("Test E").should("not.exist");
      cy.findByText("Test F").should("not.exist");
    });
  });

  it("does not show comment button when all threads are resolved", () => {
    create1ParagraphDocument();

    cy.get<DocumentId>("@documentId").then((documentId) => {
      cy.log("resolved 3-comments thread");
      createComment("Test 1").then(({ body: rootComment }) => {
        createComment("Test 2", rootComment.id);
        createComment("Test 3", rootComment.id);
        H.updateComment({ id: rootComment.id, is_resolved: true });
      });

      cy.log("resolved 3-comments thread");
      createComment("Test I").then(({ body: rootComment }) => {
        createComment("Test II", rootComment.id);
        createComment("Test III", rootComment.id);
        H.updateComment({ id: rootComment.id, is_resolved: true });
      });

      cy.log("3-comments thread with all comments deleted");
      createComment("Test X").then(({ body: rootComment }) => {
        createComment("Test Y", rootComment.id).then(({ body: comment }) => {
          deleteComment(comment.id);
        });
        createComment("Test Z", rootComment.id).then(({ body: comment }) => {
          deleteComment(comment.id);
        });
        deleteComment(rootComment.id);
      });

      function createComment(
        text: string,
        parent_comment_id: CommentId | null = null,
      ) {
        return createParagraphComment(documentId, text, parent_comment_id);
      }
    });

    H.visitDocument("@documentId");
    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.visible")
      .and("have.value", "Lorem ipsum");

    cy.get<DocumentId>("@documentId").then((targetId) => {
      cy.findByPlaceholderText("New document").realClick();
      Comments.getDocumentNodeButton({
        targetId,
        childTargetId: PARAGRAPH_ID,
      }).should("not.be.visible");
    });
  });

  it("shows other users comments and does not show comments from other nodes", () => {
    createLoremIpsumDocument();

    cy.get<DocumentId>("@documentId").then((documentId) => {
      cy.log("resolved 3-comments thread");

      createComment(documentId, HEADING_1_ID, "Test X");

      createParagraphComment(documentId, "Test 1").then(
        ({ body: rootComment }) => {
          cy.signInAsNormalUser();
          createParagraphComment(documentId, "Test A", rootComment.id);

          cy.signInAsAdmin();
          createParagraphComment(documentId, "Test 2", rootComment.id);

          cy.signInAsNormalUser();
          createParagraphComment(documentId, "Test B", rootComment.id);

          H.visitDocumentComment(documentId, PARAGRAPH_ID, rootComment.id);
        },
      );

      Comments.getSidebar().within(() => {
        Comments.getCommentByText("Test 1")
          .should("contain.text", "Bobby Tables")
          .and("contain.text", "BT");

        Comments.getCommentByText("Test A")
          .should("contain.text", "Robert Tableton")
          .and("contain.text", "RT");

        Comments.getCommentByText("Test 2")
          .should("contain.text", "Bobby Tables")
          .and("contain.text", "BT");

        Comments.getCommentByText("Test B")
          .should("contain.text", "Robert Tableton")
          .and("contain.text", "RT");

        cy.findByText("Test X").should("not.exist");

        Comments.getCommentByText("Test 1").realHover();
        Comments.getCommentByText("Test 1")
          .findByLabelText("More actions")
          .click();
      });

      cy.log("does not allow to edit or delete other people's comments");
      H.popover().findByText(/edit/i).should("not.exist");
      H.popover()
        .findByText(/delete|remove/i)
        .should("not.exist");

      Comments.getDocumentNodeButton({
        targetId: documentId,
        childTargetId: HEADING_1_ID,
        hasComments: true,
      })
        .should("be.visible")
        .and("contain.text", "1")
        .click();

      Comments.getSidebar().within(() => {
        cy.findByText("Test X").should("be.visible");
        cy.findByText("Test 1").should("not.exist");
        cy.findByText("Test 2").should("not.exist");
        cy.findByText("Test A").should("not.exist");
        cy.findByText("Test B").should("not.exist");
      });
    });
  });

  it("allows editing the document when comments are open", () => {
    create1ParagraphDocument();

    cy.get<DocumentId>("@documentId").then((documentId) => {
      H.visitDocumentComment(documentId, PARAGRAPH_ID);

      cy.get("main").within(() => {
        H.documentContent().click();

        cy.realType("test");
        cy.findByRole("button", { name: "Save" }).should("exist");

        H.documentContent()
          .get('[contenteditable="true"]')
          .should("be.visible");
        H.documentFormattingMenu().should("not.exist");
      });
    });
  });

  it("allows opening comments when document has changes", () => {
    create1ParagraphDocument();

    cy.get<DocumentId>("@documentId").then((documentId) => {
      createParagraphComment(documentId, "Test");
      H.visitDocument("@documentId");
      cy.findByRole("textbox", { name: "Document Title" })
        .should("be.visible")
        .and("have.value", "Lorem ipsum");

      H.getParagraph().realHover();
      Comments.getDocumentNodeButton({
        targetId: documentId,
        childTargetId: PARAGRAPH_ID,
        hasComments: true,
      })
        .should("be.visible")
        .and("not.be.disabled");

      H.documentContent().click();
      cy.realType("xyz");

      H.getParagraph("Lorem ipsum dolor sit amet.xyz").realHover();

      cy.findByLabelText("Comments").should("not.be.disabled").click();
      Comments.getSidebar().should("be.visible");

      cy.findByLabelText("Show all comments").should("not.be.disabled").click();
      Comments.getSidebar().should("be.visible");
    });
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

    it("supports basic formatting with keyboard shortcuts", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("bold italic strike code");

      selectCharactersLeft("code".length);
      cy.realPress([META_KEY, "e"]);

      cy.realPress("ArrowLeft");
      cy.realPress("ArrowLeft");
      selectCharactersLeft("strike".length);
      cy.realPress(["Shift", META_KEY, "S"]);

      cy.realPress("ArrowLeft");
      cy.realPress("ArrowLeft");
      selectCharactersLeft("italic".length);
      cy.realPress([META_KEY, "I"]);

      cy.realPress("ArrowLeft");
      cy.realPress("ArrowLeft");
      selectCharactersLeft("bold".length);
      cy.realPress([META_KEY, "B"]);

      cy.findByRole("button", { name: "Send" }).click();

      Comments.getCommentInputs()
        .first()
        .within(() => {
          cy.get("strong").should("have.text", "bold");
          cy.get("em").should("have.text", "italic");
          cy.get("s").should("have.text", "strike");
          cy.get("code").should("have.text", "code");
        });
    });

    it("supports basic formatting with formatting menu", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("bold italic strike code");

      selectCharactersLeft("code".length);
      H.documentFormattingMenu()
        .should("be.visible")
        .findByRole("button", { name: /format_code/ })
        .click();

      cy.realPress("ArrowLeft");
      cy.realPress("ArrowLeft");
      selectCharactersLeft("strike".length);
      H.documentFormattingMenu()
        .should("be.visible")
        .findByRole("button", { name: /text_strike/ })
        .click();

      cy.realPress("ArrowLeft");
      cy.realPress("ArrowLeft");
      selectCharactersLeft("italic".length);
      H.documentFormattingMenu()
        .should("be.visible")
        .findByRole("button", { name: /text_italic/ })
        .click();

      cy.realPress("ArrowLeft");
      cy.realPress("ArrowLeft");
      selectCharactersLeft("bold".length);
      H.documentFormattingMenu()
        .should("be.visible")
        .findByRole("button", { name: /text_bold/ })
        .click();

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
      H.documentMentionDialog().within(() => {
        cy.findByText("Lorem ipsum").should("be.visible");
        cy.findByText("First collection").should("be.visible");
        cy.findByText("Browse all").should("be.visible");
        cy.findByText("Bobby Tables").should("not.exist");
      });

      cy.realType("tAbLe");
      H.documentMentionDialog().within(() => {
        cy.findByText("Lorem ipsum").should("not.exist");
        cy.findByText("Bobby Tables").should("be.visible");
        cy.findByText("No Collection Tableton").should("be.visible");
      });

      cy.realType("s");
      H.documentMentionDialog().within(() => {
        cy.findByText("Bobby Tables").should("be.visible");
        cy.findByText("Bobby Tables's Personal Collection").should(
          "be.visible",
        );
        cy.findByText("No Collection Tableton").should("not.exist");
      });

      cy.realPress("Enter");
      H.documentMentionDialog().should("not.exist");

      cy.log("closes suggestion dialog but not the comments modal on Esc");
      cy.realType(" @no");
      H.documentMentionDialog().should("be.visible");
      cy.realPress("Escape");
      H.documentMentionDialog().should("not.exist");
      Comments.getSidebar().should("be.visible");

      cy.realType("{backspace}{backspace}{backspace}@none");
      H.documentMentionDialog().findByText("None Tableton").click();

      Comments.getSidebar().within(() => {
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
      Comments.getSidebar().should("be.visible");

      cy.log("can use mouse to select emoji");
      cy.realType("{backspace}{backspace}{backspace}:egg");
      Comments.getEmojiPicker().findByText("🥚").click();

      Comments.getSidebar().within(() => {
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

  describe("resolve / unresolve", () => {
    it("should resolve / unresolve basic discussion", () => {
      startNewCommentIn1ParagraphDocument();

      const commentText = "Test resolving";

      cy.realType(commentText);
      cy.realPress([META_KEY, "Enter"]);

      Comments.resolveCommentByText(commentText);

      cy.findByTestId("discussion").should("not.exist");
      cy.findByTestId("comments-resolved-tab").should("be.visible");
      cy.findByTestId("comments-resolved-tab")
        .should("contain.text", "Resolved (1)")
        .click();

      Comments.reopenCommentByText(commentText);

      cy.findByTestId("comments-resolved-tab").should("not.exist");
    });

    it("only first comment in a thread can be resolved", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("Main comment");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getCommentInputs().should("have.length", 2).last().click();
      cy.realType("Reply 1");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getCommentByText("Reply 1")
        .realHover()
        .within(() => {
          cy.findByTestId("comment-action-panel").should("be.visible");
          cy.findByTestId("comment-action-panel-resolve").should("not.exist");
        });

      Comments.getCommentByText("Main comment")
        .realHover()
        .within(() => {
          cy.findByTestId("comment-action-panel").should("be.visible");
          cy.findByTestId("comment-action-panel-resolve").should("be.visible");
        });
    });

    it("does not show resolved tab when there are no resolved comments", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("Main comment");
      cy.realPress([META_KEY, "Enter"]);

      cy.findByTestId("comments-resolved-tab").should("not.exist");
    });

    it("resolved threads show all comments in them", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("Main comment");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getCommentInputs().should("have.length", 2).last().click();
      cy.realType("Reply 1");
      cy.realPress([META_KEY, "Enter"]);

      Comments.resolveCommentByText("Main comment");
      cy.findByTestId("comments-resolved-tab").should("be.visible").click();

      Comments.getCommentByText("Main comment").should("be.visible");
      Comments.getCommentByText("Reply 1").should("be.visible");
    });

    it("should be possible to resolve and unresolve a thread when the first comment is deleted", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("Main comment");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getCommentInputs().should("have.length", 2).last().click();
      cy.realType("Reply 1");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getCommentByText("Main comment")
        .realHover()
        .within(() => {
          cy.findByTestId("comment-action-panel").should("be.visible");
          cy.findByTestId("comment-action-panel-more-actions")
            .should("be.visible")
            .click();
        });

      cy.findByTestId("comment-action-panel-delete")
        .should("be.visible")
        .click();

      cy.findByTestId("discussion-comment-deleted")
        .should("be.visible")
        .realHover()
        .within(() => {
          cy.findByTestId("comment-action-panel").should("be.visible");
          cy.findByTestId("comment-action-panel-resolve")
            .should("be.visible")
            .click();
        });

      cy.findByTestId("comments-resolved-tab").should("be.visible");
      cy.findByTestId("discussion-comment-deleted").should("not.exist");

      cy.log("unresolving a thread when the first comment is deleted");
      cy.findByRole("tab", { name: "Resolved (1)" }).click();
      cy.findByTestId("discussion-comment-deleted").realHover();
      cy.findByLabelText("Re-open").click();

      cy.findAllByRole("tab").should("have.length", 0);
      Comments.getNewThreadInput().should("be.visible");
    });

    it("should be possible to resolve a thread created by another user", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("Main comment");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getCommentByText("Main comment").should("be.visible");

      cy.signInAsNormalUser();
      H.visitDocument("@documentId");
      cy.findByLabelText("Show all comments").click();
      Comments.getCommentByText("Main comment").should("be.visible");
      Comments.resolveCommentByText("Main comment");

      cy.findByTestId("comments-resolved-tab").should("be.visible");
      cy.findByTestId("discussion-comment").should("not.exist");
    });

    it("should not allow replies for resolved threads", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("Main comment");
      cy.realPress([META_KEY, "Enter"]);

      Comments.resolveCommentByText("Main comment");
      cy.findByTestId("comments-resolved-tab").should("be.visible").click();

      Comments.getCommentInputs().should("have.length", 1); // only the comment content
    });
  });

  describe("links", () => {
    beforeEach(() => {
      H.grantClipboardPermissions();

      createLoremIpsumDocument();

      cy.get<DocumentId>("@documentId").then((documentId) => {
        createComment(documentId, HEADING_1_ID, "Foo").then(
          ({ body: comment }) => {
            cy.wrap(comment.id).as("headingCommentId");
          },
        );

        createComment(documentId, HEADING_1_ID, "Bar");
        createComment(documentId, PARAGRAPH_ID, "Paragraph Foo");
      });
    });

    it("copies and opens a link to a comment", () => {
      H.visitDocument("@documentId");

      cy.get<number>("@documentId").then((documentId) => {
        Comments.getDocumentNodeButton({
          targetId: documentId,
          childTargetId: HEADING_1_ID,
          hasComments: true,
        }).click();
      });

      Comments.getCommentByText("Foo").realHover();
      Comments.getCommentByText("Foo").findByLabelText("More actions").click();

      H.popover().findByText("Copy link").click();
      H.undoToast().findByText("Copied link").should("be.visible");

      H.readClipboard().then((link) => cy.visit(link));

      cy.get("@documentId").then((documentId) => {
        cy.get("@headingCommentId").then((commentId) => {
          cy.url().then((url) => {
            expect(url).to.match(
              new RegExp(
                `/document/${documentId}/comments/${HEADING_1_ID}#comment-${commentId}$`,
              ),
            );
          });
        });
      });

      Comments.getCommentByText("Foo").should(
        "have.attr",
        "aria-current",
        "location",
      );
    });

    it("opens a comment link in its thread vs. 'All comments'", () => {
      cy.get<number>("@headingCommentId").then((commentId) => {
        H.visitDocumentComment("@documentId", HEADING_1_ID, commentId);
      });

      Comments.getSidebar().within(() => {
        cy.findByRole("heading", { name: "All comments" }).should("not.exist");
        cy.findByRole("heading", { name: "Comments about this" }).should(
          "be.visible",
        );
        cy.findAllByTestId("discussion-comment").should("have.length", 2);
        Comments.getCommentByText("Foo").should(
          "have.attr",
          "aria-current",
          "location",
        );
      });
    });

    it("opens a link to a resolved comment correctly", () => {
      cy.get<number>("@headingCommentId").then((commentId) => {
        cy.request("PUT", `/api/comment/${commentId}`, {
          is_resolved: true,
        });
        H.visitDocumentComment("@documentId", HEADING_1_ID, commentId);
      });

      Comments.getSidebar().within(() => {
        cy.findByTestId("comments-resolved-tab").should("be.visible");
        cy.findAllByTestId("discussion-comment").should("have.length", 1);
        Comments.getCommentByText("Foo").should(
          "have.attr",
          "aria-current",
          "location",
        );
      });
    });

    it("changes between open/resolved tabs when resolving/unresolving a linked comment", () => {
      cy.get<number>("@headingCommentId").then((commentId) => {
        H.visitDocumentComment("@documentId", HEADING_1_ID, commentId);
      });

      Comments.getSidebar()
        .findByTestId("comments-resolved-tab")
        .should("not.exist");
      Comments.resolveCommentByText("Foo");

      Comments.getSidebar()
        .findByTestId("comments-resolved-tab")
        .should("be.visible");

      Comments.reopenCommentByText("Foo");
      Comments.getSidebar()
        .findByTestId("comments-resolved-tab")
        .should("not.exist");
    });
  });

  describe("all comments sidebar", () => {
    it("should all threads new to old", () => {
      startNewCommentIn1ParagraphDocument();
      cy.realType("thread 1");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getSidebar().within(() => {
        Comments.getNewThreadInput().type("thread 2");
        cy.realPress([META_KEY, "Enter"]);
      });

      Comments.openAllComments();

      cy.findAllByTestId("discussion-comment").should((comments) => {
        expect(comments.eq(0)).to.contain.text("thread 2");
        expect(comments.eq(1)).to.contain.text("thread 1");
      });
    });

    it("does not allow to create new threads", () => {
      startNewCommentIn1ParagraphDocument();
      cy.realType("thread 1");
      cy.realPress([META_KEY, "Enter"]);

      Comments.openAllComments();

      Comments.getNewThreadInput().should("not.exist");
    });

    it("should render placeholder when no comments", () => {
      create1ParagraphDocument();
      H.visitDocument("@documentId");

      cy.location().then((loc) => {
        cy.visit(`${loc.pathname}/comments/all`);

        Comments.getSidebar()
          .should("contain", "All comments")
          .should("contain", "No comments");
      });
    });

    it("should render placeholder when no open comments, but resolved", () => {
      create1ParagraphDocument();
      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1");
      });

      H.visitDocument("@documentId");

      Comments.getDocumentNodeButtons().eq(0).click();
      Comments.resolveCommentByText("Test 1");
      Comments.openAllComments();

      Comments.getSidebar()
        .should("contain", "All comments")
        .should("contain", "No comments");
    });
  });

  describe("comment reactions", () => {
    it("should allow to add multiple reactions to a comment", () => {
      create1ParagraphDocument();
      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1");
      });

      H.visitDocumentComment("@documentId", PARAGRAPH_ID);

      Comments.reactToComment("Test 1", FIRST_REACTION_EMOJI);
      Comments.reactToComment("Test 1", SECOND_REACTION_EMOJI);
      Comments.getSidebar().within(() => {
        cy.findByTestId("discussion-reactions").within((el) => {
          cy.wrap(el).should("contain", `${FIRST_REACTION_EMOJI}1`);
          cy.wrap(el).should("contain", `${SECOND_REACTION_EMOJI}1`);
        });
      });
    });

    it("should allow to remove own reactions from a comment", () => {
      create1ParagraphDocument();
      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1");
      });

      H.visitDocumentComment("@documentId", PARAGRAPH_ID);

      Comments.reactToComment("Test 1", FIRST_REACTION_EMOJI);
      Comments.reactToComment("Test 1", SECOND_REACTION_EMOJI);
      Comments.getSidebar().within(() => {
        cy.findByTestId("discussion-reactions").within(() => {
          cy.findByText(`${FIRST_REACTION_EMOJI}`).should("exist");
          cy.findByText(`${FIRST_REACTION_EMOJI}`).click();
          cy.findByText(`${FIRST_REACTION_EMOJI}`).should("not.exist");
        });
      });
    });

    it("should allow to react on other people's reactions", () => {
      create1ParagraphDocument();
      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1").then((comment) => {
          const { id } = comment.body;
          H.createReaction({ comment_id: id, emoji: FIRST_REACTION_EMOJI });
          H.createReaction({ comment_id: id, emoji: SECOND_REACTION_EMOJI });
        });
      });

      cy.signInAsNormalUser();
      H.visitDocumentComment("@documentId", PARAGRAPH_ID);

      Comments.reactToComment("Test 1", FIRST_REACTION_EMOJI);
      Comments.reactToComment("Test 1", SECOND_REACTION_EMOJI);

      Comments.getSidebar().within(() => {
        cy.findByTestId("discussion-reactions").within((el) => {
          cy.wrap(el).should("contain", `${FIRST_REACTION_EMOJI}2`);
          cy.wrap(el).should("contain", `${SECOND_REACTION_EMOJI}2`);
          cy.findByText(`${FIRST_REACTION_EMOJI}`).click();
          cy.wrap(el).should("contain", `${FIRST_REACTION_EMOJI}1`);
        });
      });
    });

    it("should allow to react on resolved comments", () => {
      create1ParagraphDocument();
      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1").then((comment) => {
          H.updateComment({ id: comment.body.id, is_resolved: true });
        });
      });

      H.visitDocumentComment("@documentId", PARAGRAPH_ID);

      cy.findByRole("tab", { name: "Resolved (1)" }).click();

      Comments.reactToComment("Test 1", FIRST_REACTION_EMOJI);
      Comments.reactToComment("Test 1", SECOND_REACTION_EMOJI);

      Comments.getSidebar().within(() => {
        cy.findByTestId("discussion-reactions").within((el) => {
          cy.wrap(el).should("contain", `${FIRST_REACTION_EMOJI}1`);
          cy.wrap(el).should("contain", `${SECOND_REACTION_EMOJI}1`);
        });
      });
    });

    it("should not allow to react on deleted comments", () => {
      create1ParagraphDocument();
      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1").then((comment) => {
          createParagraphComment(documentId, "Test II", comment.body.id);
          deleteComment(comment.body.id);
        });
      });

      H.visitDocumentComment("@documentId", PARAGRAPH_ID);

      Comments.getSidebar().within(() => {
        cy.findByTestId("discussion-comment-deleted")
          .realHover()
          .within(() => {
            cy.findByTestId("comment-action-panel").should("be.visible");
            cy.findByRole("button", { name: "Add reaction" }).should(
              "not.exist",
            );
          });
      });
    });
  });

  describe("top level blocks", () => {
    describe("with markdown", () => {
      it("should support blockquotes", () => {
        startNewCommentIn1ParagraphDocument();

        cy.log("verify blockquote is rendered during typing");
        cy.realType("> blockquote");
        H.getBlockquote("blockquote", Comments.getSidebar()).should(
          "be.visible",
        );

        cy.log("verify blockquote is rendered after submitting");
        cy.realPress([META_KEY, "Enter"]);
        H.getBlockquote("blockquote", Comments.getSidebar()).should(
          "be.visible",
        );
      });

      it("should support ordered lists", () => {
        startNewCommentIn1ParagraphDocument();

        cy.realType("1. one");
        cy.realPress("Enter");
        cy.realType("two");
        cy.log("verify ordered list is rendered during typing");
        H.getOrderedList("one", Comments.getSidebar()).should("be.visible");
        H.getOrderedList("two", Comments.getSidebar()).should("be.visible");

        cy.log("verify ordered list is rendered after submitting");
        cy.realPress([META_KEY, "Enter"]);

        H.getOrderedList("one", Comments.getSidebar()).should("be.visible");
        H.getOrderedList("two", Comments.getSidebar()).should("be.visible");
      });

      it("should support unordered lists", () => {
        startNewCommentIn1ParagraphDocument();

        cy.realType("- a");
        cy.realPress("Enter");
        cy.realType("b");
        cy.log("verify bullet list is rendered during typing");
        H.getBulletList("a", Comments.getSidebar()).should("be.visible");
        H.getBulletList("b", Comments.getSidebar()).should("be.visible");

        cy.log("verify bullet list is rendered after submitting");
        cy.realPress([META_KEY, "Enter"]);

        H.getBulletList("a", Comments.getSidebar()).should("be.visible");
        H.getBulletList("b", Comments.getSidebar()).should("be.visible");
      });

      it("should support code blocks", () => {
        startNewCommentIn1ParagraphDocument();

        cy.realType("```");
        cy.realPress("Enter");
        cy.log("verify code block is rendered during typing");
        cy.realType("code");
        H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");

        cy.log("verify code block is rendered after submitting");
        cy.realPress([META_KEY, "Enter"]);

        H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");
      });
    });

    describe("with shortcuts", () => {
      it("should support ordered list", () => {
        startNewCommentIn1ParagraphDocument();

        cy.realType("ol");
        cy.realPress([META_KEY, "Shift", "7"]);

        H.getOrderedList("ol", Comments.getSidebar()).should("be.visible");
      });

      it("should support bullet list", () => {
        startNewCommentIn1ParagraphDocument();

        cy.realType("ul");
        cy.realPress([META_KEY, "Shift", "8"]);

        H.getBulletList("ul", Comments.getSidebar()).should("be.visible");
      });

      it("should support code block", () => {
        startNewCommentIn1ParagraphDocument();

        cy.realType("code");
        cy.realPress([META_KEY, "Alt", "c"]);

        H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");
      });

      // explicitly disabled in CustomStarterKit to keep default browser behavior
      it.skip("should support blockquote", () => {
        startNewCommentIn1ParagraphDocument();

        cy.realType("blockquote");
        cy.realPress([META_KEY, "Shift", "k"]);

        H.getBlockquote("blockquote", Comments.getSidebar()).should(
          "be.visible",
        );
      });
    });

    it("should render saved top level blocks", () => {
      startNewCommentIn1ParagraphDocument();

      cy.realType("> blockquote");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getNewThreadInput().type("1. ol");
      cy.realPress("Enter");
      cy.realType("two");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getNewThreadInput().type("- ul");
      cy.realPress("Enter");
      cy.realType("b");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getNewThreadInput().type("```");
      cy.realPress("Enter");
      cy.realType("code");
      cy.realPress([META_KEY, "Enter"]);

      cy.reload();

      H.getBlockquote("blockquote", Comments.getSidebar()).should("be.visible");
      H.getOrderedList("ol", Comments.getSidebar()).should("be.visible");
      H.getBulletList("ul", Comments.getSidebar()).should("be.visible");
      H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");
    });
  });

  it("should remove ?new=true from the url after creating a comment", () => {
    startNewCommentIn1ParagraphDocument();

    cy.url().should("include", "?new=true");

    cy.realType("Test");
    cy.realPress([META_KEY, "Enter"]);

    cy.url().should("not.include", "?new=true");
  });

  describe("email notifications", () => {
    beforeEach(() => {
      H.setupSMTP();
    });

    it("a new thread group notifies the owner of the document", () => {
      create1ParagraphDocument();

      cy.get<DocumentId>("@documentId").then((documentId) => {
        cy.signInAsNormalUser();
        createParagraphComment(documentId, "Test 1").then(
          ({ body: comment }) => {
            H.getInbox().then((response: any) => {
              const emails = response.body;
              expect(emails).to.have.length(1);

              verifyEmail({
                email: emails[0],
                expected: {
                  address: "admin@metabase.test",
                  subject: "Comment on Lorem ipsum",
                  heading: "Robert Tableton left a comment on a document",
                  documentTitle: "Lorem ipsum",
                  documentHref: `http://localhost:4000/document/${documentId}`,
                  commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${comment.id}`,
                },
              });
            });
          },
        );
      });
    });

    it("a new reply in a thread notifies anyone in the thread", () => {
      create1ParagraphDocument();

      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1").then((comment) => {
          cy.signInAsNormalUser();

          createParagraphComment(documentId, "Test 2", comment.body.id).then(
            ({ body: comment }) => {
              H.getInbox(1).then((response: any) => {
                const emails = response.body;
                cy.log("you should not get notified about your own comments");
                expect(emails).to.have.length(1);

                verifyEmail({
                  email: emails[0],
                  expected: {
                    address: "admin@metabase.test",
                    subject: "Comment on Lorem ipsum",
                    heading: "Robert Tableton replied to a thread",
                    documentTitle: "Lorem ipsum",
                    documentHref: `http://localhost:4000/document/${documentId}`,
                    commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${comment.id}`,
                  },
                });
              });
            },
          );

          H.clearInbox();

          cy.signInAsImpersonatedUser();
          createParagraphComment(documentId, "Test 3", comment.body.id).then(
            ({ body: comment }) => {
              H.getInbox(2).then((response: any) => {
                const emails = response.body;
                expect(emails).to.have.length(2);

                const emailToAdmin = emails.find(
                  (email: any) => email.to[0].address === "admin@metabase.test",
                );
                const emailToNormalUser = emails.find(
                  (email: any) =>
                    email.to[0].address === "normal@metabase.test",
                );

                verifyEmail({
                  email: emailToAdmin,
                  expected: {
                    address: "admin@metabase.test",
                    subject: "Comment on Lorem ipsum",
                    heading: "User Impersonated replied to a thread",
                    documentTitle: "Lorem ipsum",
                    documentHref: `http://localhost:4000/document/${documentId}`,
                    commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${comment.id}`,
                  },
                });

                verifyEmail({
                  email: emailToNormalUser,
                  expected: {
                    address: "normal@metabase.test",
                    subject: "Comment on Lorem ipsum",
                    heading: "User Impersonated replied to a thread",
                    documentTitle: "Lorem ipsum",
                    documentHref: `http://localhost:4000/document/${documentId}`,
                    commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${comment.id}`,
                  },
                });
              });
            },
          );
        });
      });
    });

    it("an explicit @mention notifies that person", () => {
      create1ParagraphDocument();

      cy.get<DocumentId>("@documentId").then((documentId) => {
        H.createComment({
          target_type: "document",
          target_id: documentId,
          child_target_id: PARAGRAPH_ID,
          parent_comment_id: null,
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                attrs: {
                  _id: PARAGRAPH_ID,
                },
                content: [
                  {
                    type: "smartLink",
                    attrs: {
                      entityId: NORMAL_USER_ID,
                      model: "user",
                      label: "Robert Tableton",
                    },
                  },
                ],
              },
            ],
          },
          html: "<a href='#'>Robert Tableton</a>",
        }).then(({ body: comment }) => {
          H.getInbox().then((response: any) => {
            const emails = response.body;
            expect(emails).to.have.length(1);

            verifyEmail({
              email: emails[0],
              expected: {
                address: "normal@metabase.test",
                subject: "Comment on Lorem ipsum",
                heading: "Bobby Tables left a comment on a document",
                documentTitle: "Lorem ipsum",
                documentHref: `http://localhost:4000/document/${documentId}`,
                commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${comment.id}`,
              },
            });
          });
        });
      });
    });
  });

  it("handles commenting with users without first and last names", () => {
    cy.request("post", "/api/user", { email: "no-name@metabase.test" });
    startNewCommentIn1ParagraphDocument();
    Comments.getNewThreadInput().type("@No");
    Comments.getMentionDialog().findByText("no-name@metabase.test").click();
    Comments.getNewThreadInput().type("needs to see this");
    cy.realPress([META_KEY, "Enter"]);

    // assert that the comment was created
    Comments.getAllComments().should("have.length", 1);
    // mention is it's own span, so we need to search for the pieces individually
    Comments.getCommentByText("@no-name@metabase.test").should("exist");
    Comments.getCommentByText("needs to see this").should("exist");
  });
});

function selectCharactersLeft(count: number) {
  for (let i = 0; i < count; ++i) {
    cy.realPress(["Shift", "ArrowLeft"]);
  }
}

function startNewCommentIn1ParagraphDocument() {
  createAndVisit1ParagraphDocument();

  H.getParagraph().realHover();

  cy.get<DocumentId>("@documentId").then((targetId) => {
    Comments.getDocumentNodeButton({
      targetId,
      childTargetId: PARAGRAPH_ID,
    })
      .should("be.visible")
      .click();
  });

  Comments.getSidebar().within(() => {
    cy.findByRole("heading", { name: "Comments about this" }).should(
      "be.visible",
    );
    Comments.getNewThreadInput().click();
  });
}

function createLoremIpsumDocument() {
  return H.createDocument({
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
          type: "resizeNode",
          attrs: {
            height: 350,
            minHeight: 280,
          },
          content: [
            {
              type: "cardEmbed",
              attrs: {
                id: ORDERS_QUESTION_ID,
                name: null,
                _id: CARD_EMBED_ID,
              },
            },
          ],
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
}

function createAndVisitLoremIpsumDocument() {
  createLoremIpsumDocument();
  H.visitDocument("@documentId");
  cy.findByRole("textbox", { name: "Document Title" })
    .should("be.visible")
    .and("have.value", "Lorem ipsum");
}

function create1ParagraphDocument() {
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
}

function createAndVisit1ParagraphDocument() {
  create1ParagraphDocument();
  H.visitDocument("@documentId");
  cy.findByRole("textbox", { name: "Document Title" })
    .should("be.visible")
    .and("have.value", "Lorem ipsum");
}

function createParagraphComment(
  documentId: DocumentId,
  text: string,
  parent_comment_id: CommentId | null = null,
) {
  return createComment(documentId, PARAGRAPH_ID, text, parent_comment_id);
}

function createComment(
  documentId: DocumentId,
  nodeId: string,
  text: string,
  parent_comment_id: CommentId | null = null,
  html?: string,
) {
  return H.createComment({
    target_type: "document",
    target_id: documentId,
    child_target_id: nodeId,
    parent_comment_id,
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { _id: uuid() },
          content: [{ type: "text", text }],
        },
      ],
    },
    html: html ?? `<p>${text}</p>`,
  });
}

function verifyEmail({
  email,
  expected,
}: {
  email: {
    subject: string;
    to: { address: string }[];
    html: string;
  };
  expected: {
    subject: string;
    address: string;
    heading: string;
    documentHref: string;
    documentTitle: string;
    commentHref: string;
  };
}) {
  const { subject, to, html } = email;
  expect(subject).to.eq(expected.subject);
  expect(to).to.have.length(1);
  expect(to[0].address).to.eq(expected.address);

  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");

  cy.log("heading");
  expect(document.querySelector("h1")).to.contain.text(expected.heading);

  cy.log("link to the document");
  expect(
    document.querySelector(`a[href="${expected.documentHref}"]`),
  ).to.contain.text(expected.documentTitle);

  cy.log("link to the comment");
  expect(
    document.querySelector(`a[href="${expected.commentHref}"]`),
  ).to.contain.text("Open in Metabase");

  cy.log("link to the instance");
  expect(
    document.querySelector('a[href="http://localhost:4000"]'),
  ).to.contain.text("http://localhost:4000");

  cy.log("Metabase company name");
  const hasCompanyName = [...document.querySelectorAll("*")].some((element) => {
    return element.textContent?.trim() === "Metabase, Inc.";
  });
  expect(hasCompanyName).to.be.true;

  cy.log("Metabase company address");
  const hasCompanyAddress = [...document.querySelectorAll("*")].some(
    (element) =>
      element.textContent?.trim() ===
      "9740 Campo Rd., Suite 1029, Spring Valley, CA 91977",
  );
  expect(hasCompanyAddress).to.be.true;

  cy.log("Metabase website");
  expect(
    document.querySelector('a[href="https://www.metabase.com"]'),
  ).to.contain.text("www.metabase.com");
}
