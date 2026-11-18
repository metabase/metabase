import {
  NORMAL_USER_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
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
const REACTION_EMOJI = "😀";

describe("document comments", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("allows to comment on every type of node", () => {
    cy.intercept("GET", "/api/comment?*").as("comments");
    createAndVisitLoremIpsumDocument();
    cy.wait("@comments");

    cy.log("does not need schema adjustments by default");
    H.getHeading1().should("be.visible");
    cy.findByRole("button", { name: "Save" }).should("not.exist");

    cy.log("does not have any comments by default");
    cy.findByRole("link", { name: "Show all comments" }).should("not.exist");

    cy.get<DocumentId>("@documentId").then((documentId) => {
      testCommentingOnNode(documentId, HEADING_1_ID, H.getHeading1);
      cy.findByRole("link", { name: "Show all comments" })
        .scrollIntoView()
        .should("be.visible");
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
        Comments.getNewThreadInput().click();
        cy.realType("World");
        cy.realPress([META_KEY, "Enter"]);
        Comments.getCommentByText("World").should("be.visible");
        cy.findByText("Hello").should("not.exist");
      });

      Comments.closeSidebar();
      Comments.getSidebar().should("not.exist");
      Comments.getDocumentNodeButtons()
        .filter(":visible")
        .should("have.length", 2)
        .and(($buttons) => {
          expect($buttons.eq(0)).to.have.text("1");
          expect($buttons.eq(1)).to.have.text("1");
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
    H.getParagraph().should("be.visible");
    cy.findByRole("button", { name: "Save" }).should("not.exist");
  });

  it("allows editing the document with comments open, and opening comments with unsaved changes", () => {
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
        cy.findByRole("button", { name: "Save" }).should("exist");

        H.documentContent()
          .find('[contenteditable="true"]')
          .should("be.visible");
        H.documentFormattingMenu().should("not.exist");
      });

      Comments.getNewThreadInput().click();
      Comments.getNewThreadInput().find(".ProseMirror-focused").should("exist");
      cy.realType("Test comment");
      cy.realPress([META_KEY, "Enter"]);
      Comments.getCommentByText("Test comment").should("be.visible");
      cy.findByRole("button", { name: "Save" }).should("be.visible");
      H.getParagraph("Lorem ipsum dolor sit amet.test").should("be.visible");

      cy.findByRole("button", { name: "Save" }).click();
      cy.findByRole("button", { name: "Save" }).should("not.exist");

      cy.log("allows opening comments when document has changes");
      H.visitDocument(documentId);
      Comments.getSidebar().should("not.exist");

      H.documentContent().click();
      cy.realType("xyz");
      cy.findByRole("button", { name: "Save" }).should("be.visible");

      H.getParagraph("Lorem ipsum dolor sit amet.testxyz").realHover();
      Comments.getDocumentNodeButton({
        targetId: documentId,
        childTargetId: PARAGRAPH_ID,
        hasComments: true,
      })
        .should("be.visible")
        .and("contain.text", "1")
        .click();
      Comments.getSidebar().should("be.visible");
      cy.findByRole("button", { name: "Save" }).should("be.visible");

      Comments.openAllComments();
      Comments.getCommentByText("Test comment").should("be.visible");
      cy.findByRole("button", { name: "Save" }).should("be.visible");
    });
  });

  it("edits, reacts to and deletes a comment, and keeps the changes after a reload", () => {
    cy.intercept("POST", "/api/comment").as("createComment");
    cy.intercept("PUT", "/api/comment/*").as("updateComment");
    cy.intercept("POST", "/api/comment/*/reaction").as("react");
    cy.intercept("DELETE", "/api/comment/*").as("deleteComment");

    startNewCommentIn1ParagraphDocument();
    cy.realType("Smoke");
    cy.realPress([META_KEY, "Enter"]);
    cy.wait("@createComment").its("response.statusCode").should("eq", 200);

    Comments.getCommentByText("Smoke").realHover();
    Comments.getCommentByText("Smoke").findByLabelText("More actions").click();
    H.popover().findByText("Edit").click();
    cy.realType("Edited ");
    cy.realPress([META_KEY, "Enter"]);
    cy.wait("@updateComment").its("response.statusCode").should("eq", 200);

    Comments.reactToComment("Edited Smoke", REACTION_EMOJI);
    cy.wait("@react").its("response.body.reacted").should("eq", true);

    cy.reload();
    Comments.getCommentByText("Edited Smoke")
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "false");
    Comments.getCommentByText("Edited Smoke")
      .findByTestId("discussion-reactions")
      .should("contain", `${REACTION_EMOJI}1`);

    cy.log("a deleted first comment keeps the replies of its thread");
    // the reply editor is the only editable one among the thread editors
    Comments.getCommentInputs().find("[contenteditable='true']").click();
    cy.realType("Reply");
    cy.realPress([META_KEY, "Enter"]);
    cy.wait("@createComment").its("response.statusCode").should("eq", 200);

    Comments.getCommentByText("Edited Smoke").realHover();
    Comments.getCommentByText("Edited Smoke")
      .findByLabelText("More actions")
      .click();
    H.popover().findByText("Delete").click();
    cy.wait("@deleteComment").its("response.statusCode").should("eq", 204);

    cy.reload();
    Comments.getSidebar().within(() => {
      Comments.getCommentByText("Reply").should("be.visible");
      cy.findByText("Edited Smoke").should("not.exist");
    });

    cy.log("shows the resolve controls of a deleted first comment on hover");
    getDeletedComment()
      .findByTestId("comment-action-panel")
      .should("not.be.visible");
    getDeletedComment().realHover();
    getDeletedComment()
      .findByTestId("comment-action-panel-resolve")
      .should("be.visible")
      .click();
    cy.wait("@updateComment").its("response.statusCode").should("eq", 200);

    Comments.getSidebar()
      .findByRole("tab", { name: /Resolved/ })
      .click();
    getDeletedComment()
      .findByTestId("comment-action-panel")
      .should("not.be.visible");
    getDeletedComment().realHover();
    getDeletedComment()
      .findByTestId("comment-action-panel-reopen")
      .should("be.visible")
      .click();
    cy.wait("@updateComment").its("response.statusCode").should("eq", 200);
    Comments.getSidebar().findByRole("tab").should("not.exist");

    function getDeletedComment() {
      return Comments.getSidebar().findByTestId("discussion-comment-deleted");
    }
  });

  describe("email notifications", () => {
    beforeEach(() => {
      H.setupSMTP();
    });

    it("notifies the document owner of a new thread, thread participants of a reply, and an @mentioned user", () => {
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

      cy.log("a new reply in a thread notifies anyone in the thread");
      cy.signInAsAdmin();
      H.clearInbox();
      create1ParagraphDocument();

      cy.get<DocumentId>("@documentId").then((documentId) => {
        createParagraphComment(documentId, "Test 1").then(
          ({ body: threadComment }) => {
            cy.signInAsNormalUser();
            createParagraphComment(documentId, "Test 2", threadComment.id).then(
              ({ body: normalUserReply }) => {
                cy.signInAsImpersonatedUser();
                createParagraphComment(
                  documentId,
                  "Test 3",
                  threadComment.id,
                ).then(({ body: impersonatedUserReply }) => {
                  H.getInbox(3).then((response: any) => {
                    const emails = response.body;
                    cy.log(
                      "you should not get notified about your own comments",
                    );
                    expect(emails).to.have.length(3);

                    const getHeading = (email: any) =>
                      new DOMParser()
                        .parseFromString(email.html, "text/html")
                        .querySelector("h1")?.textContent ?? "";
                    const findEmail = (address: string, heading: string) =>
                      emails.find(
                        (email: any) =>
                          email.to[0].address === address &&
                          getHeading(email).includes(heading),
                      );

                    verifyEmail({
                      email: findEmail(
                        "admin@metabase.test",
                        "Robert Tableton replied to a thread",
                      ),
                      expected: {
                        address: "admin@metabase.test",
                        subject: "Comment on Lorem ipsum",
                        heading: "Robert Tableton replied to a thread",
                        documentTitle: "Lorem ipsum",
                        documentHref: `http://localhost:4000/document/${documentId}`,
                        commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${normalUserReply.id}`,
                      },
                    });

                    verifyEmail({
                      email: findEmail(
                        "admin@metabase.test",
                        "User Impersonated replied to a thread",
                      ),
                      expected: {
                        address: "admin@metabase.test",
                        subject: "Comment on Lorem ipsum",
                        heading: "User Impersonated replied to a thread",
                        documentTitle: "Lorem ipsum",
                        documentHref: `http://localhost:4000/document/${documentId}`,
                        commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${impersonatedUserReply.id}`,
                      },
                    });

                    verifyEmail({
                      email: findEmail(
                        "normal@metabase.test",
                        "User Impersonated replied to a thread",
                      ),
                      expected: {
                        address: "normal@metabase.test",
                        subject: "Comment on Lorem ipsum",
                        heading: "User Impersonated replied to a thread",
                        documentTitle: "Lorem ipsum",
                        documentHref: `http://localhost:4000/document/${documentId}`,
                        commentHref: `http://localhost:4000/document/${documentId}/comments/${PARAGRAPH_ID}#comment-${impersonatedUserReply.id}`,
                      },
                    });
                  });
                });
              },
            );
          },
        );
      });

      cy.log("an explicit @mention notifies that person");
      cy.signInAsAdmin();
      H.clearInbox();
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
});

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
