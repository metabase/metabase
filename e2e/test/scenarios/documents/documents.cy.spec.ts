import {
  NO_SQL_PERSONAL_COLLECTION_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
  READ_ONLY_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_AVERAGE_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
} from "e2e/support/test-visualizer-data";
import type { Document } from "metabase-types/api";

const { H } = cy;

describe("documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
  });

  describe("duplicating documents", () => {
    it("should warn about unsaved changes when duplicating an existing document", () => {
      H.createDocument({
        name: "Unsaved Duplicate Doc",
        document: {
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Original content" }],
              attrs: { _id: "1" },
            },
          ],
          type: "doc",
        },
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      cy.findByRole("textbox", { name: "Document Title" })
        .should("have.value", "Unsaved Duplicate Doc")
        .clear()
        .type("Unsaved title");

      H.documentContent().click();
      H.addToDocument(" changed", false);

      H.documentSaveButton().should("be.visible");

      cy.findByLabelText("More options").click();
      H.popover().findByText("Duplicate").click();

      cy.findByTestId("save-confirmation").should("be.visible");

      cy.findByRole("button", { name: "Cancel" }).click();

      cy.findByTestId("save-confirmation").should("not.exist");
      cy.findByRole("heading", { name: /Duplicate "/ }).should("not.exist");

      // still unsaved
      H.documentSaveButton().should("be.visible");
    });

    it("should discard unsaved changes when duplicating and then open the duplicate modal", () => {
      H.createDocument({
        name: "Discard Duplicate Doc",
        document: {
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Original content" }],
              attrs: { _id: "1" },
            },
          ],
          type: "doc",
        },
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      cy.findByRole("textbox", { name: "Document Title" })
        .should("have.value", "Discard Duplicate Doc")
        .clear()
        .type("Unsaved title");

      H.documentContent().click();
      H.addToDocument(" changed", false);

      H.documentSaveButton().should("be.visible");

      cy.findByLabelText("More options").click();
      H.popover().findByText("Duplicate").click();

      cy.findByTestId("save-confirmation").should("be.visible");
      cy.findByRole("button", { name: "Discard changes" }).click();

      // reverted
      cy.findByRole("textbox", { name: "Document Title" }).should(
        "have.value",
        "Discard Duplicate Doc",
      );
      H.documentContent().should("contain.text", "Original content");
      H.documentSaveButton().should("not.exist");

      // duplicate modal is open
      cy.findByRole("heading", { name: /Duplicate "/ }).should("be.visible");
      cy.findByRole("button", { name: "Duplicate" }).should("be.visible");
    });

    it("should save changes when duplicating, then copy and redirect to the new document", () => {
      cy.intercept("POST", "/api/document/*/copy").as("copyDoc");

      H.createDocument({
        name: "Save Duplicate Doc",
        document: {
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Original content" }],
              attrs: { _id: "1" },
            },
          ],
          type: "doc",
        },
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      cy.findByRole("textbox", { name: "Document Title" })
        .should("have.value", "Save Duplicate Doc")
        .clear()
        .type("Saved title");

      H.documentContent().click();
      H.addToDocument(" changed", false);

      H.documentSaveButton().should("be.visible");

      cy.findByLabelText("More options").click();
      H.popover().findByText("Duplicate").click();

      cy.findByTestId("save-confirmation").should("be.visible");
      cy.findByRole("button", { name: "Save changes" }).click();

      // saved
      H.documentSaveButton().should("not.exist");
      cy.findByRole("textbox", { name: "Document Title" }).should(
        "have.value",
        "Saved title",
      );

      // duplicate modal
      cy.findByRole("button", { name: "Duplicate" }).should("be.visible");
      cy.findByRole("textbox", { name: "Name" }).then(($input) => {
        // Snapshot the value now; aliasing a command chain here can become flaky after navigation.
        const copyName = ($input.val() ?? "").toString();
        cy.wrap(copyName).as("copyName");
      });

      cy.findByRole("button", { name: "Duplicate" }).click();

      cy.wait("@copyDoc").then(({ response }) => {
        const copiedId = response?.body?.id;
        expect(copiedId).to.exist;

        cy.location("pathname").should(
          "match",
          new RegExp(`^/document/${copiedId}`),
        );
      });

      cy.get<string>("@copyName").then((copyName) => {
        cy.findByRole("textbox", { name: "Document Title" }).should(
          "have.value",
          copyName,
        );
      });

      // content should match the saved changes
      H.documentContent().should("contain.text", "Original content changed");
    });

    it("should duplicate a document without any changes (happy path)", () => {
      cy.intercept("POST", "/api/document/*/copy").as("copyDoc");

      H.createDocument({
        name: "Happy Path Duplicate Doc",
        document: {
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Original content" }],
              attrs: { _id: "1" },
            },
          ],
          type: "doc",
        },
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      cy.findByRole("textbox", { name: "Document Title" }).should(
        "have.value",
        "Happy Path Duplicate Doc",
      );
      H.documentSaveButton().should("not.exist");

      cy.findByLabelText("More options").click();
      H.popover().findByText("Duplicate").click();

      cy.findByRole("heading", {
        name: 'Duplicate "Happy Path Duplicate Doc"',
      }).should("be.visible");

      cy.findByRole("textbox", { name: "Name" }).then(($input) => {
        // Snapshot the value now; aliasing a command chain here can become flaky after navigation.
        const copyName = ($input.val() ?? "").toString();
        cy.wrap(copyName).as("copyName");
      });
      cy.findByRole("button", { name: "Duplicate" }).click();

      cy.wait("@copyDoc").then(({ response }) => {
        const copiedId = response?.body?.id;
        expect(copiedId).to.exist;

        cy.location("pathname").should(
          "match",
          new RegExp(`^/document/${copiedId}`),
        );
      });

      cy.get<string>("@copyName").then((copyName) => {
        cy.findByRole("textbox", { name: "Document Title" }).should(
          "have.value",
          copyName,
        );
      });

      H.documentContent().should("contain.text", "Original content");
    });
  });

  it("should allow you to create a new document from the new button and save", () => {
    const getDocumentStub = cy.stub();

    cy.intercept("GET", "/api/document/1", getDocumentStub);

    cy.visit("/");

    H.newButton("Document").click();
    cy.title().should("eq", "New document · Metabase");

    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.focused")
      .type("Test Document");

    H.documentContent().type("This is a paragraph\nAnd this is another");

    cy.findByRole("button", { name: "Save" }).click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(0, "Our analytics").should(
      "have.attr",
      "data-active",
      "true",
    );
    H.entityPickerModalItem(1, "First collection").click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();

    // We should not show a loading state in between creating a document and viewing the created document.
    cy.location("pathname").should("eq", "/document/1");
    cy.title().should("eq", "Test Document · Metabase");

    H.expectUnstructuredSnowplowEvent({ event: "document_created" });
    cy.wrap(getDocumentStub).should("not.have.been.called");

    cy.findByLabelText("More options").click();
    H.popover().findByText("Bookmark").click();

    H.expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "document",
      triggered_from: "document_header",
    });

    // Delete the bookmark because we need to bookmark the doc again in the test
    cy.request("DELETE", "/api/bookmark/document/1");

    H.appBar()
      .findByRole("link", { name: /First collection/ })
      .click();

    H.collectionTable()
      .findByRole("link", { name: "Test Document" })
      .should("exist");

    cy.log("Document Management");

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Move").click();

    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(0, "Our analytics")
      .should("have.attr", "data-active", "true")
      .click();
    H.entityPickerModal().findByRole("button", { name: "Move" }).click();

    H.openNavigationSidebar();

    H.navigationSidebar().findByText("Our analytics").click();
    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Bookmark").click();
    H.expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "document",
      triggered_from: "collection_list",
    });

    H.navigationSidebar()
      .findByRole("section", { name: "Bookmarks" })
      .findByText("Test Document")
      .click();

    cy.location("pathname").should("equal", "/document/1-test-document");
    H.documentContent().should("contain.text", "This is a paragraph");

    H.appBar()
      .findByRole("link", { name: /Our analytics/ })
      .click();

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Duplicate").click();
    cy.findByRole("heading", { name: 'Duplicate "Test Document"' }).should(
      "exist",
    );

    cy.findByTestId("collection-picker-button").click();
    H.entityPickerModalTab("Collections").click();
    H.entityPickerModalItem(0, /Personal Collection/).click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();
    H.modal().findByRole("button", { name: "Duplicate" }).click();
    H.openNavigationSidebar();
    H.navigationSidebar().findByText("Your personal collection").click();

    cy.findByTestId("collection-table")
      .findByText("Test Document - Duplicate")
      .click();

    cy.findByRole("textbox", { name: "Document Title" }).should(
      "have.value",
      "Test Document - Duplicate",
    );

    H.documentContent().should("contain.text", "This is a paragraph");

    H.openNavigationSidebar();
    H.navigationSidebar().findByText("Our analytics").click();

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Move to trash").click();

    // Force the click since this is hidden behind a toast notification
    H.navigationSidebar().findByText("Trash").click({ force: true });
    H.getUnpinnedSection().findByText("Test Document").should("exist").click();

    cy.log("test that deleted documents cannot be edited (metabase#63112)");
    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.visible")
      .and("have.attr", "readonly");
    H.documentContent()
      .findByRole("textbox")
      .should("have.attr", "contenteditable", "false");
  });

  it("should focus the start of the document body when pressing Enter on the title input", () => {
    cy.visit("/document/new");

    cy.log("Type a title");
    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.focused")
      .type("Doc Title{enter}");

    cy.log("Add some content to the document body");
    H.addToDocument("One{enter}Two");

    cy.log("Click back on the title to focus it and hit Enter");
    cy.findByRole("textbox", { name: "Document Title" })
      .click()
      .type("{enter}");

    cy.log("Focus should be placed at the beginning of the document body");
    cy.realType("NEW: ");
    H.documentContent().should("have.text", "NEW: OneTwo");
  });

  it("should handle navigating from /new to /new gracefully", () => {
    cy.visit("/");
    H.newButton("Document").click();
    cy.title().should("eq", "New document · Metabase");
    H.documentContent().click();

    H.documentSaveButton().should("not.exist");

    H.addToDocument("This is some content");

    H.documentSaveButton().should("exist");

    H.newButton("Document").click();
    H.expectUnstructuredSnowplowEvent(
      {
        event: "unsaved_changes_warning_displayed",
      },
      1,
    );
    H.leaveConfirmationModal().findByRole("button", { name: "Cancel" }).click();

    H.documentContent().should("have.text", "This is some content");

    H.newButton("Document").click();
    H.expectUnstructuredSnowplowEvent(
      {
        event: "unsaved_changes_warning_displayed",
      },
      2,
    );
    H.leaveConfirmationModal()
      .findByRole("button", { name: "Discard changes" })
      .click();
    H.documentContent().should("have.text", "");
    H.documentSaveButton().should("not.exist");
  });

  describe("document editing", () => {
    describe("Document with content", () => {
      beforeEach(() => {
        H.createDocument({
          name: "Bar Document",
          document: {
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Lorem Ipsum and some more words",
                  },
                ],
                attrs: {
                  _id: "1",
                },
              },
              {
                type: "resizeNode",
                attrs: {
                  height: 442,
                  minHeight: 280,
                },
                content: [
                  {
                    type: "cardEmbed",
                    attrs: {
                      id: ORDERS_QUESTION_ID,
                      name: null,
                      _id: "2",
                    },
                  },
                ],
              },
              {
                type: "paragraph",
                attrs: {
                  _id: "3",
                },
              },
            ],
            type: "doc",
          },
          collection_id: null,
          alias: "document",
          idAlias: "documentId",
        });
      });

      it("renders a 'not found' message if the copied card has been permanently deleted", () => {
        cy.get<Document>("@document").then(({ id, document: { content } }) => {
          const resizeNode = content?.find((n) => n.type === "resizeNode");
          const cardEmbed = resizeNode?.content?.[0];
          const clonedCardId = cardEmbed?.attrs?.id;
          cy.request("DELETE", `/api/card/${clonedCardId}`);
          H.visitDocument(id);
        });
        cy.findByTestId("document-card-embed").should(
          "have.text",
          "Couldn't find this chart.",
        );
      });

      it("read only access", () => {
        cy.signIn("readonly");

        H.visitDocument("@documentId");

        H.documentContent()
          .findByRole("textbox")
          .should("have.attr", "contenteditable", "false");

        H.openDocumentCardMenu("Orders");
        H.popover().findAllByRole("menuitem").should("be.disabled");
      });

      it("no access", () => {
        cy.signIn("nocollection");

        H.visitDocument("@documentId");
        cy.findByRole("status").should(
          "contain.text",
          "Sorry, you don’t have permission to see that.",
        );
      });

      it("not found", () => {
        H.visitDocument(9999);
        H.main().within(() => {
          cy.findByText("We're a little lost...").should("be.visible");
          cy.findByText("The page you asked for couldn't be found.").should(
            "be.visible",
          );
        });
      });

      it("should allow you to print", () => {
        H.visitDocument("@documentId");
        cy.findByRole("button", { name: "More options" }).click();

        // This needs to be *after* the page load to work
        cy.window().then((win: Window) => {
          cy.stub(win, "print").as("printStub");
        });

        H.popover().findByText("Print Document").click();

        cy.get("@printStub").should("have.been.calledOnce");

        cy.get("@documentId").then((id) => {
          H.expectUnstructuredSnowplowEvent({
            event: "document_print",
            target_id: id,
          });
        });
      });

      it("should handle undo/redo properly, resetting the history whenever a different document is viewed", () => {
        const isMac = Cypress.platform === "darwin";
        const metaKey = isMac ? "Meta" : "Control";
        H.visitDocument("@documentId");
        H.getDocumentCard("Orders").should("exist");
        H.documentContent().within(() => {
          const originalText = "Lorem Ipsum and some more words";
          const originalExact = new RegExp(`^${originalText}$`);
          cy.contains(originalExact).click();
          cy.realPress([metaKey, "z"]);
          cy.contains(originalExact);

          const modification = " etc.";
          const modifiedExact = new RegExp(`^${originalText}${modification}$`);
          H.addToDocument(modification, false);
          cy.contains(modifiedExact);
          cy.realPress([metaKey, "z"]);
          cy.contains(originalExact);
          cy.realPress(["Shift", metaKey, "z"]);
          cy.contains(modifiedExact);
          cy.realPress([metaKey, "z"]); // revert to prevent "unsaved changes" dialog
        });
        H.newButton("Document").click();
        H.documentContent().should("have.text", "");
        cy.realPress([metaKey, "z"]);
        H.documentContent().should("have.text", "");
      });

      it("should not clear undo history on save", () => {
        const isMac = Cypress.platform === "darwin";
        const metaKey = isMac ? "Meta" : "Control";

        const originalText = "Lorem Ipsum and some more words";
        const originalExact = new RegExp(`^${originalText}$`);
        H.visitDocument("@documentId");
        cy.findByTestId("document-card-embed").should("contain", "37.65"); // wait for data loading
        H.documentContent().contains(originalExact).click();

        const modification = " etc.";
        const modifiedExact = new RegExp(`^${originalText}${modification}$`);
        H.addToDocument(modification, false);
        H.documentContent().contains(modifiedExact);

        cy.realPress([metaKey, "s"]);
        cy.findByTestId("toast-undo")
          .findByText("Document saved")
          .should("be.visible");

        cy.realPress([metaKey, "z"]);
        cy.realPress([metaKey, "z"]);
        H.documentContent().contains(originalExact);
      });
    });
  });

  describe("Empty Document", () => {
    beforeEach(() => {
      H.createDocument({
        name: "Foo Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      H.addPostgresDatabase();
    });

    it("should support typing with a markdown syntax", () => {
      H.visitDocument("@documentId");
      H.documentContent().click();

      H.addToDocument("# This is a heading level 1");
      H.addToDocument("## This is a heading level 2");
      H.addToDocument("### This is a heading level 3");
      H.addToDocument("#### This is a heading level 4");

      H.addToDocument("**Some Bold Text**");
      H.addToDocument("*Some Italic Text*");

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

      it("should support formatting via floating menu", () => {
        const content = "Some text to play with";

        const formatTests = [
          {
            button: /text_bold/,
            role: "strong",
          },
          {
            button: /text_italic/,
            role: "emphasis",
          },
          {
            button: /text_strike/,
            role: "paragraph", // figure out what to do here
          },
          {
            button: /format_code/,
            role: "code",
          },
          {
            button: /H1/,
            role: "heading",
          },
          {
            button: /H2/,
            role: "heading",
          },
          {
            button: /^list/,
            role: "list",
          },
          {
            button: /ordered_list/,
            role: "list",
          },
          {
            button: /quote/,
            role: "blockquote",
          },
          {
            button: /code_block/,
            role: "code",
            revert: false,
          },
        ];

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

        formatTests.forEach(({ button, role, revert = true }) => {
          H.documentFormattingMenu()
            .findByRole("button", { name: button })
            .click();
          H.documentContent().findByRole(role).should("contain.text", content);
          if (revert) {
            H.documentFormattingMenu()
              .findByRole("button", { name: button })
              .click();
            assertUnformatted();
          }
        });
      });
    });

    describe("Card Embeds", () => {
      beforeEach(() => {
        H.createQuestion(PRODUCTS_AVERAGE_BY_CATEGORY);
        H.createQuestion(ACCOUNTS_COUNT_BY_CREATED_AT);
        // Need to get this one to simulate recent activity
        H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY_PIE).then(
          ({ body: { id } }) => cy.request("POST", `/api/card/${id}/query`),
        );
        H.createDashboard({
          name: "Fancy Dashboard",
        }).then(({ body: { id } }) => {
          H.createQuestion({
            ...ORDERS_COUNT_BY_PRODUCT_CATEGORY,
            dashboard_id: id,
          });
        });
        H.visitDocument("@documentId");
      });

      it("should support keyboard and mouse selection in suggestions without double highlight", () => {
        H.activateToken("bleeding-edge");
        H.visitDocument("@documentId");

        H.documentContent().click();
        H.addToDocument("/", false);

        assertOnlyOneOptionActive(/Ask Metabot/);

        cy.realPress("{downarrow}");
        cy.realPress("{downarrow}");

        //Link should be active
        assertOnlyOneOptionActive("Link");

        // Hover over Quote
        H.commandSuggestionItem(/Quote/).realHover();

        assertOnlyOneOptionActive(/Quote/);

        H.addToDocument("pro", false);

        assertOnlyOneOptionActive(/Products by Category/);

        cy.realPress("{downarrow}");
        assertOnlyOneOptionActive(/Products average/);

        H.commandSuggestionItem(/Products by Category/).realHover();

        assertOnlyOneOptionActive(/Products by Category/);

        cy.realPress("Escape");

        H.clearDocumentContent();

        H.addToDocument("@ord", false);

        cy.realPress("{downarrow}");
        cy.realPress("{downarrow}");

        assertOnlyOneOptionActive(/Orders, Count$/, "mention");

        H.documentMentionDialog()
          .findByRole("option", { name: /Browse all/ })
          .realHover();

        assertOnlyOneOptionActive(/Browse all/, "mention");

        cy.realPress("Escape");
        H.clearDocumentContent();
        H.addToDocument("/", false);

        H.commandSuggestionItem(/Ask Metabot/).click();
        H.addToDocument("@", false);

        assertOnlyOneOptionActive(/QA Postgres/, "metabot");
        cy.realPress("{downarrow}");
        assertOnlyOneOptionActive(/Sample/, "metabot");

        H.documentMetabotSuggestionItem(/QA Postgres/).realHover();
        assertOnlyOneOptionActive(/QA Postgres/, "metabot");
      });

      it("should support adding cards and updating viz settings", () => {
        H.documentContent().click();
        H.addToDocument("/", false);

        cy.log("search via type");
        H.addToDocument("Accounts", false);
        H.commandSuggestionDialog().should(
          "contain.text",
          ACCOUNTS_COUNT_BY_CREATED_AT.name,
        );

        cy.realPress("{downarrow}");
        H.addToDocument("\n", false);

        cy.get("@documentId").then((id) => {
          H.expectUnstructuredSnowplowEvent({
            event: "document_add_card",
            target_id: id,
          });
        });

        H.getDocumentCard(ACCOUNTS_COUNT_BY_CREATED_AT.name).should("exist");

        cy.realPress("{downarrow}");

        cy.log("via recents");
        H.addToDocument("/", false);
        H.commandSuggestionItem("Chart").click();
        H.commandSuggestionDialog()
          .findByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name)
          .click();
        H.getDocumentCard(PRODUCTS_COUNT_BY_CATEGORY_PIE.name).should("exist");

        cy.realPress("{downarrow}");

        cy.log("via entity picker");
        H.addToDocument("/", false);

        H.commandSuggestionItem("Chart").click();
        H.commandSuggestionItem(/Browse all/).click();

        H.entityPickerModalTab("Questions").click();
        H.entityPickerModalItem(1, PRODUCTS_AVERAGE_BY_CATEGORY.name).click();

        H.getDocumentCard(PRODUCTS_AVERAGE_BY_CATEGORY.name).should("exist");
        cy.realPress("{downarrow}");

        cy.log("dashboard question via entity picker");
        H.addToDocument("/", false);

        H.commandSuggestionItem("Chart").click();
        H.commandSuggestionItem(/Browse all/).click();

        H.entityPickerModalTab("Questions").click();
        H.entityPickerModalItem(1, "Fancy Dashboard").click();
        H.entityPickerModalItem(
          2,
          ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        ).click();

        H.getDocumentCard(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name).should(
          "exist",
        );

        cy.log("change a cards display type");
        H.openDocumentCardMenu(ACCOUNTS_COUNT_BY_CREATED_AT.name);
        H.popover().findByText("Edit Visualization").click();

        H.getDocumentSidebar().findByRole("button", { name: /Bar/i }).click();
        cy.findByRole("menu", { name: /Bar/i }).findByText("Line").click();
        H.getDocumentSidebar().within(() => {
          cy.findByText("Axes").click();
          cy.findByDisplayValue("Created At: Month").clear().type("Foo Axes");
        });

        H.assertDocumentCardVizType(ACCOUNTS_COUNT_BY_CREATED_AT.name, "Line");
        H.getDocumentCard(ACCOUNTS_COUNT_BY_CREATED_AT.name).findByText(
          "Foo Axes",
        );
        H.getDocumentSidebar().findByRole("button", { name: /close/ }).click();

        // Edit the Query. Assert on the number of breakouts
        H.openDocumentCardMenu(PRODUCTS_COUNT_BY_CATEGORY_PIE.name);
        H.getDocumentCard(PRODUCTS_COUNT_BY_CATEGORY_PIE.name)
          .findByRole("list")
          .findAllByRole("listitem")
          .should("have.length", 4);
        H.popover().findByText("Edit Query").click();

        H.removeSummaryGroupingField({ field: "Category" });
        H.addSummaryGroupingField({ field: "Price" });
        H.modal().findByRole("button", { name: "Save and use" }).click();

        H.getDocumentCard(PRODUCTS_COUNT_BY_CATEGORY_PIE.name)
          .findByRole("list")
          .findAllByRole("listitem")
          .should("have.length", 7);

        //Replace Card
        H.openDocumentCardMenu(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name);
        H.popover().findByText("Replace").click();

        H.modal().within(() => {
          cy.findByText("Choose a question or model").should("exist");

          cy.findAllByPlaceholderText("Search…").click().type("Orders");

          cy.findAllByTestId("result-item").findByText("Orders").click();
        });

        cy.get("@documentId").then((id) => {
          H.expectUnstructuredSnowplowEvent({
            event: "document_replace_card",
            target_id: id,
          });
        });

        H.documentContent()
          .findAllByTestId("card-embed-title")
          .contains(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name)
          .should("not.exist");

        H.getDocumentCard("Orders").should("exist");
      });

      it("should support renaming cards", () => {
        cy.log("Add card");
        H.documentContent().click();
        H.addToDocument("/", false);
        H.commandSuggestionItem("Chart").click();
        H.commandSuggestionDialog()
          .findByText(PRODUCTS_COUNT_BY_CATEGORY_PIE.name)
          .click();

        cy.log("Rename card");
        cy.findByTestId("card-embed-title").realHover();
        cy.icon("pencil").click();
        cy.realType("New name{enter}");

        cy.log("Edit query");
        H.openDocumentCardMenu("New name");
        H.popover().findByText("Edit Query").click();
        H.removeSummaryGroupingField({ field: "Category" });
        H.addSummaryGroupingField({ field: "Price" });
        H.modal().findByRole("button", { name: "Save and use" }).click();

        cy.log("Assert new name is preserved");
        H.getDocumentCard("New name").should("exist");
      });

      it("should support resizing cards", () => {
        H.documentContent().click();
        H.addToDocument("/", false);

        cy.log("search via type");
        H.addToDocument("Accounts", false);
        H.commandSuggestionDialog().should(
          "contain.text",
          ACCOUNTS_COUNT_BY_CREATED_AT.name,
        );

        cy.realPress("{downarrow}");
        H.addToDocument("\n", false);

        H.getDocumentCard(ACCOUNTS_COUNT_BY_CREATED_AT.name).then((el) => {
          const ogHeight = el.height();
          const resizeNode = H.getDocumentCardResizeContainer(
            ACCOUNTS_COUNT_BY_CREATED_AT.name,
          );

          H.documentDoDrag(H.getDragHandleForDocumentResizeNode(resizeNode), {
            y: 200,
          });

          H.getDocumentCard(ACCOUNTS_COUNT_BY_CREATED_AT.name).then((el) => {
            const newHeight = el.height();

            cy.log(`${ogHeight}, ${newHeight}`);

            expect(newHeight).to.be.lessThan(ogHeight as number);
          });
        });
      });

      it("should copy an added card on save", () => {
        cy.intercept({
          method: "PUT",
          path: "/api/document/*",
        }).as("documentUpdate");
        cy.intercept({
          method: "GET",
          path: "/api/document/*",
        }).as("documentGet");

        cy.intercept("POST", "/api/card/*/query").as("cardQuery");

        //initial load
        H.documentContent().click();

        H.addToDocument("/ord", false);

        H.commandSuggestionDialog()
          .should("contain.text", "Orders, Count, Grouped by Created At (year)")
          .should("contain.text", "Orders, Count")
          .should("contain.text", "Orders Model");

        H.commandSuggestionItem(
          /Orders, Count, Grouped by Created At \(year\)/,
        ).click();

        //Adding a new line
        H.addToDocument("");
        H.addToDocument("Adding a static link: /", false);
        H.commandSuggestionItem("Link").click();

        H.addToDocument("Ord", false);
        H.commandSuggestionItem(/Orders, Count$/).click();
        H.addToDocument(" And continue typing", false);

        H.documentContent().within(() => {
          cy.findAllByTestId("document-card-embed")
            .should("have.length", 1)
            .should(
              "contain.text",
              "Orders, Count, Grouped by Created At (year)",
            );

          cy.findByRole("link", { name: /Orders, Count$/ }).should("exist");
        });

        cy.findByRole("button", { name: "Save" }).click();

        cy.wait("@documentUpdate");

        cy.wait("@documentGet");

        cy.get("@documentId").then((id) => {
          H.expectUnstructuredSnowplowEvent({
            event: "document_saved",
            target_id: id,
          });
          H.expectUnstructuredSnowplowEvent({
            event: "document_add_smart_link",
            target_id: id,
          });
        });

        cy.findByTestId("toast-undo")
          .findByText("Document saved")
          .should("be.visible");

        cy.wait("@cardQuery");

        cy.wait(100);

        cy.findByTestId("document-card-embed")
          .findByText("Orders, Count, Grouped by Created At (year)")
          .click();

        cy.location("pathname").should(
          "not.include",
          ORDERS_BY_YEAR_QUESTION_ID.toString(),
        );

        // Navigating to a question from a document should result in a back button
        cy.findByLabelText("Back to Foo Document").click();

        cy.get("@documentId").then((id) =>
          cy.location("pathname").should("equal", `/document/${id}`),
        );

        H.getDocumentCard("Orders, Count, Grouped by Created At (year)").should(
          "be.visible",
        );

        H.cartesianChartCircle().eq(1).click();

        H.popover().findByText("See these Orders").click();

        cy.findByLabelText("Back to Foo Document").click();

        cy.get("@documentId").then((id) =>
          cy.location("pathname").should("equal", `/document/${id}`),
        );
      });
    });
  });

  describe("creating new questions", () => {
    beforeEach(() => {
      H.createDocument({
        name: "New Question Test Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });

      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("should allow creating a new notebook question and embedding it in the document", () => {
      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Trigger command menu and select Chart");
      H.addToDocument("/", false);
      H.commandSuggestionItem("Chart").click();
      H.commandSuggestionItem(/New chart/).click();
      H.commandSuggestionItem(/New Question/).click();

      cy.log("Create a simple query in the notebook editor");
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders").click();
      });

      cy.log("Save and use the new question");
      cy.findByRole("dialog", { name: "Create new question" }).within(() => {
        cy.findByText("Orders").should("exist");
        cy.findByRole("button", { name: "Save and use" }).click();
      });

      cy.wait("@dataset");

      cy.log("Verify the question is embedded in the document");
      H.getDocumentCard("Orders").should("exist");

      cy.get("@documentId").then((id) => {
        H.expectUnstructuredSnowplowEvent({
          event: "document_add_card",
          target_id: id,
        });
      });

      cy.log("Verify document can be saved with a new question");
      cy.findByRole("button", { name: "Save" }).should("be.visible").click();
      cy.findByRole("button", { name: "Save" }).should("not.exist");

      H.undoToast().findByText("Document saved").should("exist");
    });

    it("should allow creating a new native SQL question and embedding it in the document", () => {
      cy.intercept("GET", "/api/database").as("database");
      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Trigger command menu and select Chart");
      H.addToDocument("/", false);
      H.commandSuggestionItem("Chart").click();
      H.commandSuggestionItem(/New chart/).click();
      H.commandSuggestionItem(/New SQL query/).click();

      cy.log("Save and use the new SQL query");

      cy.wait("@database");
      cy.wait(200); // wait for db selector to load

      cy.findByTestId("selected-database").should("exist");

      H.NativeEditor.focus();
      H.NativeEditor.type("SELECT * FROM ORDERS LIMIT 10");

      cy.findByRole("dialog", { name: "Edit SQL Query" })
        .findByRole("button", { name: "Save and use" })
        .click();

      cy.wait("@dataset");

      cy.log("Verify the SQL query is embedded in the document");
      H.getDocumentCard("New question").should("exist");
      cy.findByRole("button", { name: "Save" }).should("be.visible").click();

      cy.get("@documentId").then((id) => {
        H.expectUnstructuredSnowplowEvent({
          event: "document_add_card",
          target_id: id,
        });
      });

      cy.log("Change native question title");
      H.documentContent().within(() => {
        cy.findByText("New question").realHover();
        cy.icon("pencil").click();

        cy.realType("New native question");
      });
      cy.get(".node-paragraph").first().click(); // unfocus cardEmbed

      H.getDocumentCard("New native question").should("be.visible");

      cy.log("Verify document can be saved with a new question");
      cy.findByRole("button", { name: "Save" }).should("be.visible").click();
      cy.findByRole("button", { name: "Save" }).should("not.exist");

      H.undoToast().findByText("Document saved").should("exist");
    });

    it("should support keyboard navigation when creating a new question", () => {
      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Trigger command menu and navigate to 'Chart' item");
      H.addToDocument("/", false);
      H.commandSuggestionItem("Chart").should(
        "have.attr",
        "aria-selected",
        "true",
      );
      cy.realPress("{enter}");

      cy.log("Click 'New chart' to open question type menu");
      H.commandSuggestionItem(/New chart/)
        .should("exist")
        .should("have.attr", "aria-selected", "true");
      H.commandSuggestionItem(/Browse all/).should("exist");
      cy.realPress("{enter}");

      cy.log("Verify notebook option is selected by default");
      H.commandSuggestionItem(/New Question/).should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.log("Navigate to SQL option");
      cy.realPress("{downarrow}");

      H.commandSuggestionItem(/New SQL query/).should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.log("Select SQL option with Enter");
      cy.realPress("{enter}");

      cy.log("Verify native query modal opens");
      cy.findByRole("dialog", { name: "Edit SQL Query" }).should("be.visible");

      cy.log("Cancel the modal");
      cy.findByRole("dialog", { name: "Edit SQL Query" })
        .findByRole("button", { name: "Cancel" })
        .click();

      cy.log("Verify modal is closed");
      cy.findByRole("dialog", { name: "Edit SQL Query" }).should("not.exist");
    });

    it("should show 'Create new question' footer when no search results are found", () => {
      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Trigger command menu and select Chart");
      H.addToDocument("/", false);
      H.commandSuggestionItem("Chart").click();

      cy.log("Search for something that doesn't exist");
      H.addToDocument("xyznonexistentquery", false);

      cy.log("Verify 'No results found' message appears");
      H.commandSuggestionDialog().should("contain.text", "No results found");

      H.commandSuggestionDialog().findByRole("separator").should("exist");

      cy.log("Verify 'Create new question' footer is visible");
      H.commandSuggestionItem(/New chart/).should("be.visible");

      cy.log("Verify 'Browse all' footer is also visible");
      H.commandSuggestionItem(/Browse all/).should("be.visible");
    });

    it("should automatically assign appropriate visualization type for time series aggregation", () => {
      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Trigger command menu and create a new question");
      H.addToDocument("/", false);
      H.commandSuggestionItem("Chart").click();
      H.commandSuggestionItem(/New chart/).click();
      H.commandSuggestionItem(/New Question/).click();

      cy.log("Create a time series query with Orders table");
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders").click();
      });

      H.addSummaryField({ metric: "Sum of ...", field: "Total" });
      H.addSummaryGroupingField({ field: "Created At" });

      cy.findByRole("dialog", { name: "Create new question" })
        .findByRole("button", { name: "Save and use" })
        .click();

      cy.log("Verify the question is embedded with a line chart visualization");
      H.getDocumentCard("Orders, Sum of Total, Grouped by Created At: Month")
        .should("exist")
        .within(() => {
          cy.log("Verify it has a line chart visualization (not a table)");
          cy.findByTestId("chart-container").should("exist");
          cy.get("svg").should("exist");
          H.cartesianChartCircle().should("have.length.at.least", 1);
        });
    });

    it("should trigger new question type suggestion menu when typing non-matching search and hitting Enter", () => {
      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Type a non-matching search term");
      H.addToDocument("/asdfsdaf", false);

      H.commandSuggestionDialog().should("be.visible");
      H.commandSuggestionDialog().should("contain.text", "No results found");
      H.commandSuggestionItem(/New chart/)
        .should("exist")
        .should("have.attr", "aria-selected", "true");
      cy.realPress("Enter");

      cy.log("Verify that the new question type suggestion menu appears");
      H.commandSuggestionDialog().should("be.visible");
      H.commandSuggestionItem(/New Question/).should("be.visible");
      H.commandSuggestionDialog()
        .findByText(/Browse all/)
        .should("not.exist");
    });
  });

  describe("creating new questions - limited permissions", () => {
    it("should not show 'Create new question' option for users without database permissions", () => {
      cy.signIn("readonly");

      H.createDocument({
        name: "Test Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: READ_ONLY_PERSONAL_COLLECTION_ID,
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Trigger command menu and select Chart");
      H.addToDocument("/", false);
      H.commandSuggestionItem("Chart").click();

      cy.log("Verify 'Create new question' footer is not visible");
      H.commandSuggestionDialog()
        .findByRole("button", { name: /New chart/ })
        .should("not.exist");

      cy.log("Search for something to verify footer doesn't appear");
      H.addToDocument("xyznonexistent", false);

      cy.log("Verify 'No results found' message appears");
      H.commandSuggestionDialog().should("contain.text", "No results found");

      cy.log(
        "Verify 'Create new question' footer is still not visible for no-permission user",
      );
      H.commandSuggestionDialog()
        .findByRole("button", { name: /New chart/ })
        .should("not.exist");

      cy.log("Verify 'Browse all' footer is still available");
      H.commandSuggestionItem(/Browse all/).should("be.visible");
    });

    it("should not show native SQL question option for users without native query editing permissions", () => {
      cy.signIn("nosql");

      H.createDocument({
        name: "Test Document",
        document: {
          content: [],
          type: "doc",
        },
        collection_id: NO_SQL_PERSONAL_COLLECTION_ID,
        alias: "document",
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");
      H.documentContent().click();

      cy.log("Trigger command menu and select Chart");
      H.addToDocument("/", false);
      H.commandSuggestionItem("Chart").click();

      cy.log("Click 'New chart' to open question type menu");
      H.commandSuggestionItem(/New chart/).click();

      cy.log("Verify only notebook option is available, not SQL");
      H.commandSuggestionItem(/New SQL query/).should("not.exist");

      cy.log("Verify notebook modal opens automatically");
      cy.findByRole("dialog", { name: "Create new question" }).should(
        "be.visible",
      );
    });
  });

  describe("anchor links", () => {
    // Helper to create filler paragraphs for scroll tests
    const createFillerParagraphs = (count: number, startIndex: number) =>
      Array.from({ length: count }, (_, i) => ({
        type: "paragraph",
        attrs: { _id: `filler-paragraph-${startIndex + i}` },
        content: [
          {
            type: "text",
            text: `This is filler paragraph ${startIndex + i} to make the document long enough to require scrolling. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
          },
        ],
      }));

    beforeEach(() => {
      H.createDocument({
        name: "Anchor Test Document",
        document: {
          content: [
            {
              type: "heading",
              attrs: { level: 1, _id: "heading-block-1" },
              content: [{ type: "text", text: "First Heading" }],
            },
            {
              type: "paragraph",
              attrs: { _id: "paragraph-block-1" },
              content: [{ type: "text", text: "Some content here" }],
            },
            // Add filler content to ensure scrolling is needed
            ...createFillerParagraphs(15, 1),
            {
              type: "heading",
              attrs: { level: 2, _id: "heading-block-2" },
              content: [{ type: "text", text: "Second Heading" }],
            },
            {
              type: "paragraph",
              attrs: { _id: "paragraph-block-2" },
              content: [{ type: "text", text: "More content here" }],
            },
            // More filler to push blockquote down
            ...createFillerParagraphs(10, 16),
            {
              type: "blockquote",
              attrs: { _id: "blockquote-block-1" },
              content: [
                {
                  type: "paragraph",
                  attrs: { _id: "quote-paragraph" },
                  content: [{ type: "text", text: "A nice quote" }],
                },
              ],
            },
          ],
          type: "doc",
        },
        collection_id: null,
        alias: "document",
        idAlias: "documentId",
      });
    });

    it("should show anchor link icon on left side when hovering over a heading", () => {
      H.visitDocument("@documentId");

      H.documentContent()
        .findByRole("heading", { name: "First Heading" })
        .realHover();

      // Filter to visible one since all blocks have hidden buttons
      cy.get('[data-testid="anchor-link-menu"]')
        .filter(":visible")
        .first()
        .findByRole("button", { name: /copy link/i })
        .should("be.visible");
    });

    it("should copy anchor URL to clipboard when clicking anchor link", () => {
      H.visitDocument("@documentId");

      cy.wrap(
        Cypress.automation("remote:debugger:protocol", {
          command: "Browser.grantPermissions",
          params: {
            permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
            origin: window.location.origin,
          },
        }),
      );

      H.documentContent()
        .findByRole("heading", { name: "First Heading" })
        .realHover();

      // Filter to visible one since all blocks have hidden buttons
      cy.get('[data-testid="anchor-link-menu"]')
        .filter(":visible")
        .first()
        .findByRole("button", { name: /copy link/i })
        .click();

      cy.get("body").findByText("Copied!").should("be.visible");

      cy.window().then((win) => {
        win.navigator.clipboard.readText().then((text) => {
          expect(text).to.include("/document/");
          expect(text).to.include("#heading-block-1");
        });
      });
    });

    it("should scroll to the correct block when navigating with anchor hash", () => {
      cy.get("@documentId").then((documentId) => {
        cy.visit(`/document/${documentId}#heading-block-2`);

        H.documentContent()
          .findByRole("heading", { name: "Second Heading" })
          .should("be.visible");

        H.documentContent()
          .findByRole("heading", { name: "First Heading" })
          .should("not.be.visible");
      });
    });

    it("should still show comments menu on right side (regression check)", () => {
      H.visitDocument("@documentId");

      H.documentContent()
        .findByRole("heading", { name: "First Heading" })
        .realHover();

      // Filter to visible one since all blocks have hidden menus
      cy.get('[data-testid="anchor-link-menu"]')
        .filter(":visible")
        .first()
        .findByRole("button", { name: /copy link/i })
        .should("be.visible");

      // Comments button uses ForwardRefLink, so it's a link role not button
      cy.get('[data-testid="comments-menu"]')
        .filter(":visible")
        .first()
        .findByRole("link", { name: /comments/i })
        .should("be.visible");
    });
  });

  describe("error handling", () => {
    it("should display an error toast when creating a new document fails", () => {
      // setup
      cy.intercept("POST", "/api/document", { statusCode: 500 });
      cy.intercept("GET", "/api/collection/*").as("getCollection");
      cy.visit("/document/new");

      // make changes and attempt to save
      cy.findByRole("textbox", { name: "Document Title" }).type("Title");
      H.documentSaveButton().click();
      H.entityPickerModalTab("Collections").click();
      cy.wait("@getCollection");
      H.entityPickerModalItem(0, "Our analytics").should(
        "have.attr",
        "data-active",
        "true",
      );
      H.entityPickerModal().findByRole("button", { name: "Select" }).click();

      // assert error toast is visible and user can reattempt save
      cy.findByTestId("toast-undo")
        .should("be.visible")
        .and("contain.text", "Error saving document");
      H.documentSaveButton().should("be.visible");
    });

    it("should display an error toast when updating a document fails", () => {
      // setup
      cy.intercept("PUT", "/api/document/*", { statusCode: 500 });
      H.createDocument({
        name: "Test Document",
        document: { type: "doc", content: [] },
        idAlias: "documentId",
      });
      H.visitDocument("@documentId");

      // make changes and attempt to save
      H.documentContent().click();
      H.addToDocument("aaa");
      H.documentSaveButton().click();

      // assert error toast is visible and user can reattempt save
      cy.findByTestId("toast-undo")
        .should("be.visible")
        .and("contain.text", "Error saving document");
      H.documentSaveButton().should("be.visible");
    });
  });

  describe("revision history", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/revision/revert").as("revert");
      cy.intercept("GET", "/api/revision*").as("revisionHistory");
    });

    it("should be able to view and revert document revisions", () => {
      cy.log("Create a document with initial content");
      H.createDocument({
        name: "Revision Test Document",
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Initial content",
                },
              ],
            },
          ],
        },
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      cy.log("Make changes to create a revision");
      cy.findByRole("textbox", { name: "Document Title" })
        .clear()
        .type("Updated Document Title");
      H.documentContent().click();
      H.addToDocument("Updated content");
      H.documentSaveButton().click();
      cy.findByTestId("toast-undo")
        .should("be.visible")
        .and("contain.text", "Document saved");

      cy.log("Make another change");
      H.documentContent().click();
      H.addToDocument("More changes");
      H.documentSaveButton().click();
      cy.contains('[data-testid="toast-undo"]', "Document saved").should(
        "be.visible",
      );

      cy.log("Open revision history");
      cy.findByLabelText("More options").click();
      H.popover().findByText("History").click();

      cy.wait("@revisionHistory");

      cy.log("Verify revision history sidebar is open");
      cy.findByTestId("document-history-list").should("be.visible");

      cy.log("Verify revision entries are displayed");
      cy.findByTestId("document-history-list")
        .findByText(/created this/)
        .should("be.visible");

      cy.log("Revert to an earlier revision");
      cy.intercept("GET", "/api/document/*").as("documentReload");
      cy.findByTestId("document-history-list")
        .findByText(/created this/)
        .parent()
        .within(() => {
          cy.findByTestId("question-revert-button").click();
        });
      cy.wait(["@revert", "@documentReload"]);

      cy.log("Verify document was reverted");
      cy.findByRole("textbox", { name: "Document Title" }).should(
        "have.value",
        "Revision Test Document",
      );
      H.documentContent().should("contain.text", "Initial content");
      H.documentContent().should("not.contain.text", "Updated content");

      cy.log("Verify revert entry appears in history");
      cy.findByTestId("document-history-list")
        .findByText(/reverted to an earlier version/)
        .should("be.visible");
    });
  });
});

const assertOnlyOneOptionActive = (
  name: string | RegExp,
  dialog: "command" | "mention" | "metabot" = "command",
) => {
  const dialogContainer =
    dialog === "command"
      ? H.commandSuggestionDialog
      : dialog === "mention"
        ? H.documentMentionDialog
        : H.documentMetabotDialog;

  dialogContainer()
    .findByRole("option", { name })
    .should("have.attr", "aria-selected", "true");

  dialogContainer()
    .findAllByRole("option")
    .filter("[aria-selected=true]")
    .should("have.length", 1);
};
