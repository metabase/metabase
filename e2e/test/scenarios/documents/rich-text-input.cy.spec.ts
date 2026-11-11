import { times } from "underscore";

import { PRODUCTS_AVERAGE_BY_CATEGORY } from "e2e/support/test-visualizer-data";
import type { DocumentId } from "metabase-types/api";

const { H } = cy;
const { Comments } = H;

const IS_MAC = Cypress.platform === "darwin";
const META_KEY = IS_MAC ? "Meta" : "Control";

const PARAGRAPH_ID = "b7fa322a-964e-d668-8d30-c772ef4f0022";

describe("rich-text input in documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("document editor", () => {
    it("should support formatting via floating menu and typing with a markdown syntax", () => {
      H.createDocument({
        name: "Foo Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: null,
        idAlias: "documentId",
      });
      H.visitDocument("@documentId");

      cy.log("floating menu formatting");
      const content = "Some text to play with";

      const assertUnformatted = () =>
        H.documentContent()
          // Converting to a heading currently adds a newline, which generates a new paragraph
          .findAllByRole("paragraph")
          .eq(0)
          .should("contain.text", content);

      H.documentContent().click();

      H.addToDocument(content, false);
      cy.realPress(["Shift", "{home}"]);

      H.documentFormattingMenu().should("exist");

      cy.log("mark button");
      H.documentFormattingMenu()
        .findByRole("button", { name: /text_bold/ })
        .click();
      H.documentContent().findByRole("strong").should("contain.text", content);
      H.documentFormattingMenu()
        .findByRole("button", { name: /text_bold/ })
        .click();
      assertUnformatted();

      cy.log("block button");
      H.documentFormattingMenu().findByRole("button", { name: /H1/ }).click();
      H.documentContent().findByRole("heading").should("contain.text", content);
      H.documentFormattingMenu().findByRole("button", { name: /H1/ }).click();
      assertUnformatted();

      cy.log("markdown syntax");
      H.clearDocumentContent();
      H.documentContent().click();

      H.addToDocument("# This is a heading level 1");
      H.addToDocument("## This is a heading level 2");
      H.addToDocument("### This is a heading level 3");
      H.addToDocument("#### This is a heading level 4");

      H.addToDocument("**Some Bold Text**");
      H.addToDocument("*Some Italic Text*");
      H.addToDocument("~~Some Strikethrough Text~~");

      H.addToDocument("Lets start an unordered list");
      H.addToDocument("- First Item");
      H.addToDocument("Second Item");
      // New Line to break out of the list;
      H.addToDocument("");

      H.addToDocument("Lets start an ordered list");
      H.addToDocument("1. First Ordered Item");
      H.addToDocument("Second Ordered Item");
      // New Line to break out of the list;
      H.addToDocument("");

      H.addToDocument("http://metabase.com");

      H.addToDocument("We can also add `inline code blocks` to paragraphs");
      H.addToDocument("```");
      H.addToDocument("Or add whole code blocks");
      //Break out of the code block
      H.addToDocument("\n");

      H.documentContent().within(() => {
        cy.findByRole("heading", {
          name: "This is a heading level 1",
        }).should("exist");
        cy.findByRole("heading", {
          name: "This is a heading level 2",
        }).should("exist");
        cy.findByRole("heading", {
          name: "This is a heading level 3",
        }).should("exist");
        cy.findByRole("heading", {
          name: "This is a heading level 4",
        }).should("exist");
        cy.findByRole("strong").should("contain.text", "Some Bold Text");
        cy.findByRole("emphasis").should("contain.text", "Some Italic Text");
        cy.get("s").should("contain.text", "Some Strikethrough Text");

        cy.findAllByRole("list").should("have.length", 2);
        cy.findAllByRole("listitem")
          .should("contain.text", "First Item")
          .should("contain.text", "Second Item")
          .should("contain.text", "First Ordered Item")
          .should("contain.text", "Second Ordered Item");

        cy.findByRole("link", { name: "http://metabase.com" }).should("exist");

        cy.findAllByRole("code").contains("inline code blocks").should("exist");
        cy.findAllByRole("code")
          .contains("Or add whole code blocks")
          .should("exist");
      });
    });
  });

  describe("links", () => {
    beforeEach(() => {
      H.createQuestion(PRODUCTS_AVERAGE_BY_CATEGORY);
    });

    it("should convert markdown links, add, edit and remove links via the floating menu, and add smart links via the suggestion and mention menus", () => {
      cy.visit("/document/new");
      H.documentContent().click();

      cy.log("Convert a markdown link to a real link");
      H.addToDocument("Read [there](url.com).", false);
      H.documentContent()
        .findByRole("paragraph")
        .should("contain.text", "Read there.")
        .findByRole("link", { name: "there" })
        .should("exist");
      H.addToDocument("", true);

      cy.log("Add text and make a link");
      H.addToDocument("Click here", false);
      times("here".length, () => cy.realPress(["Shift", "{leftarrow}"]));
      H.documentFormattingMenu().findByRole("button", { name: /link/ }).click();
      cy.realType("test.com{enter}");

      cy.log("Assert link exists with correct href");
      H.documentContent()
        .findByRole("link", { name: "here" })
        .invoke("attr", "href")
        .then((href) => expect(href).to.equal("https://test.com"));

      cy.log("Edit link url");
      H.documentContent().findByRole("link", { name: "here" }).realHover();
      cy.icon("pencil").click();
      H.documentFormattingMenu().find("input").should("be.focused");
      cy.realType("url.com/a/1?k=v");
      H.documentFormattingMenu().icon("check").click();

      cy.log("Assert link still exists, has updated href");
      H.documentContent()
        .findByRole("link", { name: "here" })
        .invoke("attr", "href")
        .then((href) => expect(href).to.equal("https://url.com/a/1?k=v"));

      cy.log("Remove link");
      H.documentContent().findByRole("link", { name: "here" }).realHover();
      cy.icon("pencil").click();
      cy.findByTestId("document-formatting-menu").icon("trash").click();

      cy.log("Assert link is unlinked");
      H.documentContent()
        .contains("p", "Click here")
        .findByRole("link", { name: "here" })
        .should("not.exist");

      cy.log("Add a smart link from the suggestion menu");
      moveCursorToDocumentEnd();
      H.addToDocument("", true);
      cy.log("Trigger suggestion menu with /");
      H.addToDocument("/", false);

      cy.log("Select Link from the suggestion menu");
      H.commandSuggestionItem("Link").click();

      H.addToDocument(PRODUCTS_AVERAGE_BY_CATEGORY.name.substring(0, 5), false);

      cy.log("Select the first item from the list");
      H.commandSuggestionDialog().findAllByRole("option").first().click();

      cy.log("Verify smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: new RegExp(PRODUCTS_AVERAGE_BY_CATEGORY.name),
        })
        .should("exist");

      cy.log("Add a smart link using 'Browse all' option in suggestion menu");
      H.addToDocument("", true);
      openLinkSuggestionBrowseAllPicker();

      H.modal().within(() => {
        cy.findByText("Choose an item to link").should("be.visible");

        cy.findByText("Our analytics").click();
        cy.findByText("Orders in a dashboard").click();
        cy.button("Select").should("be.visible").and("be.enabled").click();
      });

      cy.log("Verify dashboard smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: new RegExp("Orders in a dashboard"),
        })
        .should("exist");

      cy.log("Add collection link");
      H.addToDocument("", true);

      openLinkSuggestionBrowseAllPicker();
      H.modal().within(() => {
        cy.findByText("All personal collections").click();

        cy.log(
          "Verify that synthetic collections are not available for using as links",
        );
        cy.button("Select").should("be.visible").and("be.disabled");

        cy.findAllByText("Bobby Tables's Personal Collection")
          .should("have.length", 2)
          .last()
          .click();
        cy.button("Select").should("be.visible").and("be.enabled").click();
      });

      cy.log("Verify collection smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: new RegExp("Bobby Tables's Personal Collection"),
        })
        .should("exist");

      cy.log("Add a smart link using 'Browse all' option in mention menu");
      H.addToDocument("", true);
      openLinkMentionMenuBrowseAllPicker();

      H.modal().within(() => {
        cy.findByText("Choose an item to link").should("be.visible");

        H.pickEntity({ path: ["Databases", "Sample Database", "Products"] });
        cy.button("Select").should("be.visible").and("be.enabled").click();
      });

      cy.log("Verify table smart link was added");
      H.documentContent()
        .findByRole("link", {
          name: /Products$/,
        })
        .should("exist");
    });
  });

  describe("comment editor", () => {
    it("supports formatting via keyboard shortcuts, and emojis", () => {
      startNewCommentIn1ParagraphDocument();

      cy.log("supports basic formatting with keyboard shortcuts");
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

      Comments.getAllComments()
        .should("have.length", 1)
        .eq(0)
        .within(() => {
          cy.get("strong").should("have.text", "bold");
          cy.get("em").should("have.text", "italic");
          cy.get("s").should("have.text", "strike");
          cy.get("code").should("have.text", "code");
        });

      cy.log("supports emojis");
      Comments.getNewThreadInput().click();
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
      Comments.getEmojiPicker().should("be.visible");
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
      });

      Comments.getAllComments()
        .should("have.length", 2)
        .eq(1)
        .within(() => {
          cy.contains("😊").should("be.visible");
          cy.contains("🍆").should("be.visible");
          cy.contains("🥚").should("be.visible");
        });
    });

    it("supports mentions, including yourself", () => {
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

      cy.log("closes mention dialog but not the comments modal on Esc");
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
      });

      Comments.getAllComments()
        .should("have.length", 1)
        .eq(0)
        .within(() => {
          cy.findByText("a few seconds ago").should("be.visible");
          cy.findByText("@Bobby Tables").should("be.visible");
          cy.findByText("@None Tableton").should("be.visible");
        });
    });
  });

  describe("top level blocks", () => {
    it("should support top level blocks with markdown and shortcuts and render them after submitting and reloading", () => {
      startNewCommentIn1ParagraphDocument();

      cy.log("blockquote");
      cy.realType("> blockquote");
      H.getBlockquote("blockquote", Comments.getNewThreadInput()).should(
        "be.visible",
      );
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 1);
      H.getBlockquote("blockquote", Comments.getAllComments().eq(0)).should(
        "be.visible",
      );

      cy.log("ordered list shortcut");
      Comments.getNewThreadInput().click();
      cy.realType("ol shortcut");
      cy.realPress([META_KEY, "Shift", "7"]);

      H.getOrderedList("ol shortcut", Comments.getNewThreadInput()).should(
        "be.visible",
      );
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 2);
      H.getOrderedList("ol shortcut", Comments.getAllComments().eq(1)).should(
        "be.visible",
      );

      cy.log("bullet list shortcut");
      Comments.getNewThreadInput().click();
      cy.realType("ul shortcut");
      cy.realPress([META_KEY, "Shift", "8"]);

      H.getBulletList("ul shortcut", Comments.getNewThreadInput()).should(
        "be.visible",
      );
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 3);
      H.getBulletList("ul shortcut", Comments.getAllComments().eq(2)).should(
        "be.visible",
      );

      cy.log("code block shortcut");
      Comments.getNewThreadInput().click();
      cy.realType("code shortcut");
      cy.realPress([META_KEY, "Alt", "c"]);

      H.getCodeBlock("code shortcut", Comments.getNewThreadInput()).should(
        "be.visible",
      );
      cy.realPress([META_KEY, "Enter"]);
      Comments.getAllComments().should("have.length", 4);
      H.getCodeBlock("code shortcut", Comments.getAllComments().eq(3)).should(
        "be.visible",
      );

      cy.intercept("GET", "/api/document/*").as("reloadedDocument");
      cy.intercept("GET", "/api/comment?*").as("reloadedComments");
      cy.reload();
      cy.wait(["@reloadedDocument", "@reloadedComments"]);

      // The thread is taller than the sidebar, so scroll each block into view
      H.getBlockquote("blockquote", Comments.getSidebar())
        .scrollIntoView()
        .should("be.visible");
      H.getOrderedList("ol shortcut", Comments.getSidebar())
        .scrollIntoView()
        .should("be.visible");
      H.getBulletList("ul shortcut", Comments.getSidebar())
        .scrollIntoView()
        .should("be.visible");
      H.getCodeBlock("code shortcut", Comments.getSidebar())
        .scrollIntoView()
        .should("be.visible");
    });
  });
});

function openLinkSuggestionBrowseAllPicker() {
  moveCursorToDocumentEnd();

  cy.log("Trigger suggestion menu with /");
  H.addToDocument("/", false);

  cy.log("Select Link from the suggestion menu");
  H.commandSuggestionItem("Link").click();

  H.commandSuggestionItem(/Browse all/).click();
}

function openLinkMentionMenuBrowseAllPicker() {
  moveCursorToDocumentEnd();

  cy.log("Trigger mention menu with @");
  H.addToDocument("@", false);

  H.documentMentionItem(/Browse all/).click();
}

function moveCursorToDocumentEnd() {
  H.documentContent().click();
  cy.realPress([
    H.metaKey,
    Cypress.platform === "darwin" ? "ArrowDown" : "End",
  ]);
}

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
