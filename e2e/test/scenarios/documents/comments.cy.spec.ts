import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import { uuid } from "metabase/utils/uuid";
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
      cy.intercept("PUT", "/api/document/*").as("updateDocument");
      cy.findByRole("button", { name: "Save" }).click();
      // Wait for the save to fully persist. On success the page schedules a
      // navigation back to /document/:id; if that navigation resolves late
      // (e.g. under network throttling) it clobbers the comments route opened
      // below and the sidebar never mounts. Waiting for the request + the
      // "Document saved" toast forces that navigation to settle first.
      cy.wait("@updateDocument");
      H.undoToast().findByText("Document saved").should("be.visible");
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
        .realClick();

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
    cy.intercept("PUT", "/api/document/*").as("updateDocument");
    cy.findByRole("button", { name: "Save" }).should("be.visible").click();
    cy.wait("@updateDocument");
    cy.findByRole("button", { name: "Save" }).should("not.exist");

    cy.reload();

    cy.log("document is not dirty after persisting the missing _id");
    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.visible")
      .and("have.value", "Lorem ipsum");
    H.getParagraph().should("be.visible");
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
      Comments.getCommentInputs().should("have.length", 8);

      cy.log("allows to delete a comment");
      Comments.getCommentByText("Reply A").realHover();
      Comments.getCommentByText("Reply A")
        .findByLabelText("More actions")
        .click();
    });

    H.popover().findByText("Delete").click();

    Comments.getSidebar().within(() => {
      cy.findByText("Reply B").should("be.visible");
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
    Comments.getCommentByText("Reply 1")
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "true")
      .and("be.focused")
      .realType("My ");
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

  it("allows editing the document when comments are open", () => {
    create1ParagraphDocument();

    cy.get<DocumentId>("@documentId").then((documentId) => {
      H.visitDocumentComment(documentId, PARAGRAPH_ID);

      // The empty sidebar's new-thread composer autofocuses when it
      // mounts — wait for that to settle so it can't steal focus back
      // after we click into the document below.
      Comments.getNewThreadInput().find(".ProseMirror-focused").should("exist");

      cy.get("main").within(() => {
        H.documentContent().click();
        H.documentContent().find(".ProseMirror-focused").should("exist");

        cy.realType("test");
        cy.findByRole("button", { name: "Save" }).should("be.visible");

        H.documentContent()
          .find('[contenteditable="true"]')
          .should("be.visible")
          .and("contain.text", "test");
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
    it("supports basic formatting with markdown, keyboard shortcuts, and the formatting menu", () => {
      startNewCommentIn1ParagraphDocument();

      cy.log("markdown");
      cy.realType("**bold** *italic* ~~strike~~ `code`");
      cy.realPress([META_KEY, "Enter"]);
      assertFormattedComment({ index: 0, count: 1 });

      cy.log("keyboard shortcuts");
      Comments.getNewThreadInput().click();
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

      cy.realPress([META_KEY, "Enter"]);
      assertFormattedComment({ index: 1, count: 2 });

      cy.log("formatting menu");
      Comments.getNewThreadInput().click();
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
      assertFormattedComment({ index: 2, count: 3 });

      function assertFormattedComment({
        index,
        count,
      }: {
        index: number;
        count: number;
      }) {
        Comments.getAllComments()
          .should("have.length", count)
          .eq(index)
          .within(() => {
            cy.get("strong").should("have.text", "bold");
            cy.get("em").should("have.text", "italic");
            cy.get("s").should("have.text", "strike");
            cy.get("code").should("have.text", "code");
          });
      }
    });

    it("supports mentions and can mention yourself", () => {
      cy.request("POST", "/api/user", { email: "no-name@metabase.test" });
      cy.intercept({
        method: "GET",
        pathname: "/api/search",
        query: { q: "tAbLes" },
      }).as("searchTables");

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
      cy.wait("@searchTables").its("response.statusCode").should("eq", 200);
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

      cy.log("can mention users without first and last names");
      Comments.getNewThreadInput().type("@No");
      Comments.getMentionDialog().findByText("no-name@metabase.test").click();
      Comments.getNewThreadInput().type("needs to see this");
      cy.realPress([META_KEY, "Enter"]);

      Comments.getAllComments().should("have.length", 2);
      Comments.getCommentByText("@no-name@metabase.test").should("be.visible");
      Comments.getCommentByText("needs to see this").should("be.visible");
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

    it("copies and opens a link to a comment, and follows it across open/resolved tabs", () => {
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
      Comments.getSidebar()
        .findByTestId("comments-resolved-tab")
        .should("not.exist");

      cy.log("resolving the linked comment switches to the Resolved tab");
      Comments.resolveCommentByText("Foo");
      Comments.getSidebar()
        .findByTestId("comments-resolved-tab")
        .should("be.visible")
        .and("have.attr", "aria-selected", "true");

      cy.log("re-opening the linked comment switches back");
      Comments.reopenCommentByText("Foo");
      Comments.getCommentByText("Bar").should("be.visible");
      Comments.getSidebar()
        .findByTestId("comments-resolved-tab")
        .should("not.exist");
    });
  });

  describe("comment reactions", () => {
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

      Comments.getSidebar()
        .findByTestId("discussion-reactions")
        .should("contain", `${FIRST_REACTION_EMOJI}2`)
        .and("contain", `${SECOND_REACTION_EMOJI}2`)
        .findByText(FIRST_REACTION_EMOJI)
        .click();
      Comments.getSidebar()
        .findByTestId("discussion-reactions")
        .should("contain", `${FIRST_REACTION_EMOJI}1`)
        .and("contain", `${SECOND_REACTION_EMOJI}2`);
    });
  });

  describe("top level blocks", () => {
    it("supports top level blocks with markdown and renders them after saving", () => {
      startNewCommentIn1ParagraphDocument();

      cy.log("blockquote");
      cy.realType("> blockquote");
      H.getBlockquote("blockquote", Comments.getSidebar()).should("be.visible");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 1);
      H.getBlockquote("blockquote", Comments.getSidebar()).should("be.visible");

      cy.log("ordered list");
      Comments.getNewThreadInput().type("1. ol");
      cy.realPress("Enter");
      cy.realType("two");
      H.getOrderedList("ol", Comments.getSidebar()).should("be.visible");
      H.getOrderedList("two", Comments.getSidebar()).should("be.visible");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 2);
      H.getOrderedList("ol", Comments.getSidebar()).should("be.visible");
      H.getOrderedList("two", Comments.getSidebar()).should("be.visible");

      cy.log("bullet list");
      Comments.getNewThreadInput().type("- ul");
      cy.realPress("Enter");
      cy.realType("b");
      H.getBulletList("ul", Comments.getSidebar()).should("be.visible");
      H.getBulletList("b", Comments.getSidebar()).should("be.visible");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 3);
      H.getBulletList("ul", Comments.getSidebar()).should("be.visible");
      H.getBulletList("b", Comments.getSidebar()).should("be.visible");

      cy.log("code block");
      Comments.getNewThreadInput().type("```");
      cy.realPress("Enter");
      cy.realType("code");
      H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 4);
      H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");

      cy.intercept("GET", "/api/document/*").as("reloadedDocument");
      cy.intercept("GET", "/api/comment?*").as("reloadedComments");
      cy.reload();
      cy.wait(["@reloadedDocument", "@reloadedComments"]);

      H.getBlockquote("blockquote", Comments.getSidebar()).should("be.visible");
      H.getOrderedList("ol", Comments.getSidebar()).should("be.visible");
      H.getOrderedList("two", Comments.getSidebar()).should("be.visible");
      H.getBulletList("ul", Comments.getSidebar()).should("be.visible");
      H.getBulletList("b", Comments.getSidebar()).should("be.visible");
      H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");
    });

    it("supports top level blocks with keyboard shortcuts", () => {
      startNewCommentIn1ParagraphDocument();

      cy.log("ordered list");
      cy.realType("ol");
      cy.realPress([META_KEY, "Shift", "7"]);
      H.getOrderedList("ol", Comments.getSidebar()).should("be.visible");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 1);

      cy.log("bullet list");
      Comments.getNewThreadInput().click();
      cy.realType("ul");
      cy.realPress([META_KEY, "Shift", "8"]);
      H.getBulletList("ul", Comments.getSidebar()).should("be.visible");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 2);

      cy.log("code block");
      Comments.getNewThreadInput().click();
      cy.realType("code");
      cy.realPress([META_KEY, "Alt", "c"]);
      H.getCodeBlock("code", Comments.getSidebar()).should("be.visible");
    });
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
