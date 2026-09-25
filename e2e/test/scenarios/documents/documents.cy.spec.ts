import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers/api";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PIVOT_TABLE_CARD,
  PRODUCTS_AVERAGE_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
} from "e2e/support/test-visualization-data";
import type { Document } from "metabase-types/api";

const { H } = cy;

describe("documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
  });

  describe("duplicating documents", () => {
    it("should duplicate a document, requiring unsaved changes to be saved first", () => {
      cy.intercept("POST", "/api/document/*/copy").as("copyDoc");

      H.createDocument({
        name: "Duplicate Doc",
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

      cy.log("Duplicate a document without unsaved changes");
      cy.findByRole("textbox", { name: "Document Title" }).should(
        "have.value",
        "Duplicate Doc",
      );
      H.documentSaveButton().should("not.exist");

      cy.findByLabelText("More options").click();
      H.popover().findByText("Duplicate").click();

      cy.findByRole("heading", { name: 'Duplicate "Duplicate Doc"' }).should(
        "be.visible",
      );
      duplicateAndAssertRedirect();
      H.documentContent().should("contain.text", "Original content");

      cy.log("Cancelling the save prompt keeps the unsaved changes");
      cy.findByRole("textbox", { name: "Document Title" })
        .clear()
        .type("Saved title");

      H.documentContent().click();
      H.addToDocument(" changed", false);

      H.documentSaveButton().should("be.visible");

      cy.findByLabelText("More options").click();
      H.popover().findByText("Duplicate").click();

      cy.findByTestId("save-confirmation").should("be.visible");
      cy.findByRole("button", { name: "Cancel" }).click();

      H.documentSaveButton().should("be.visible");
      cy.findByTestId("save-confirmation").should("not.exist");
      cy.findByRole("heading", { name: /Duplicate "/ }).should("not.exist");

      cy.log("Saving from the prompt saves, then duplicates");
      cy.findByLabelText("More options").click();
      H.popover().findByText("Duplicate").click();

      cy.findByTestId("save-confirmation").should("be.visible");
      cy.findByRole("button", { name: "Save changes" }).click();

      cy.findByRole("heading", { name: 'Duplicate "Saved title"' }).should(
        "be.visible",
      );
      H.documentSaveButton().should("not.exist");
      cy.findByRole("textbox", { name: "Document Title" }).should(
        "have.value",
        "Saved title",
      );

      duplicateAndAssertRedirect();
      H.documentContent().should("contain.text", "Original content changed");
    });
  });

  it("should allow you to create a new document from the new button and save", () => {
    const getDocumentStub = cy.stub();

    cy.intercept("POST", "/api/document").as("createDocument");
    cy.intercept("GET", "/api/document/*", getDocumentStub);

    cy.visit("/");

    H.newButton("Document").click();
    cy.title().should("eq", "New document · Metabase");

    cy.findByRole("textbox", { name: "Document Title" })
      .should("be.focused")
      .type("Test Document");

    H.documentContent().type("This is a paragraph\nAnd this is another");

    cy.findByRole("button", { name: "Save" }).click();

    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalItem(1, "First collection").click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();

    cy.wait("@createDocument").then(({ response }) => {
      cy.wrap(response?.body.id).as("newDocumentId");
    });

    // We should not show a loading state in between creating a document and viewing the created document.
    cy.get("@newDocumentId").then((id) => {
      cy.location("pathname").should("eq", `/document/${id}`);
    });
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
    cy.get("@newDocumentId").then((id) => {
      cy.request("DELETE", `/api/bookmark/document/${id}`);
    });

    H.appBar()
      .findByRole("link", { name: /First collection/ })
      .click();

    H.collectionTable()
      .findByRole("link", { name: "Test Document" })
      .should("be.visible");

    cy.log("Document Management");

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Move").click();

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

    cy.get("@newDocumentId").then((id) => {
      cy.location("pathname").should("equal", `/document/${id}-test-document`);
    });
    H.documentContent().should("contain.text", "This is a paragraph");

    H.appBar()
      .findByRole("link", { name: /Our analytics/ })
      .click();

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Duplicate").click();
    cy.findByRole("heading", { name: 'Duplicate "Test Document"' }).should(
      "be.visible",
    );

    cy.findByTestId("collection-picker-button").click();
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

  it("should default the save modal to a selectable collection when Library is enabled (#73538)", () => {
    H.activateToken("pro-self-hosted");
    H.createLibrary();
    cy.intercept("POST", "/api/document").as("createDocument");

    cy.visit("/");

    H.newButton("Document").click();
    cy.findByRole("textbox", { name: "Document Title" }).type(
      "Document in default collection",
    );
    H.documentContent().type(
      "This document should save without changing folders",
    );

    cy.findByRole("button", { name: "Save" }).click();

    H.entityPickerModal()
      .findByTestId("entity-picker-select-button")
      .should("be.enabled")
      .click();

    cy.wait("@createDocument").then(({ request }) => {
      expect(request.body).not.to.have.property("collection_id");
    });
    cy.location("pathname").should("match", /^\/document\/\d+/);
    cy.findByRole("textbox", { name: "Document Title" }).should(
      "have.value",
      "Document in default collection",
    );
  });

  it("should focus the document body from the title and warn before discarding a new document", () => {
    cy.visit("/");
    H.newButton("Document").click();
    cy.title().should("eq", "New document · Metabase");

    cy.findByRole("textbox", { name: "Document Title" }).should("be.focused");
    H.documentSaveButton().should("not.exist");

    cy.log("Pressing Enter on the title focuses the start of the body");
    cy.findByRole("textbox", { name: "Document Title" }).type(
      "Doc Title{enter}",
    );
    H.addToDocument("One{enter}Two");

    cy.findByRole("textbox", { name: "Document Title" })
      .click()
      .type("{enter}");

    cy.realType("NEW: ");
    H.documentContent().should("have.text", "NEW: OneTwo");
    H.documentSaveButton().should("be.visible");

    cy.log("Starting another new document warns about unsaved changes");
    H.newButton("Document").click();
    H.expectUnstructuredSnowplowEvent(
      {
        event: "unsaved_changes_warning_displayed",
      },
      1,
    );
    H.leaveConfirmationModal().findByRole("button", { name: "Cancel" }).click();

    H.documentContent().should("have.text", "NEW: OneTwo");

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

      it("should handle read-only, unauthorized, missing documents and deleted cards", () => {
        cy.log("Read-only access makes the editor non-editable");
        cy.signIn("readonly");
        H.visitDocument("@documentId");
        H.getDocumentCard("Orders").should("be.visible");
        H.documentContent()
          .findByRole("textbox")
          .should("have.attr", "contenteditable", "false");

        cy.log("No collection access shows the permission error");
        cy.signIn("nocollection");
        H.visitDocument("@documentId");
        cy.findByRole("status").should(
          "contain.text",
          "Sorry, you don’t have permission to see that.",
        );

        cy.log("A nonexistent document shows the not found page");
        cy.signInAsAdmin();
        H.visitDocument(9999);
        H.main().within(() => {
          cy.findByText("We're a little lost...").should("be.visible");
          cy.findByText("The page you asked for couldn't be found.").should(
            "be.visible",
          );
        });

        cy.log("A permanently deleted copied card shows a 'not found' message");
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

      it("should handle undo/redo properly, resetting the history whenever a different document is viewed", () => {
        H.visitDocument("@documentId");
        H.getDocumentCard("Orders").should("exist");
        H.documentContent().within(() => {
          const originalText = "Lorem Ipsum and some more words";
          const originalExact = new RegExp(`^${originalText}$`);
          cy.contains(originalExact).click();
          cy.realPress([H.metaKey, "z"]);
          cy.contains(originalExact);

          const modification = " etc.";
          const modifiedExact = new RegExp(`^${originalText}${modification}$`);
          H.addToDocument(modification, false);
          cy.contains(modifiedExact);
          cy.realPress([H.metaKey, "z"]);
          cy.contains(originalExact);
          cy.realPress(["Shift", H.metaKey, "z"]);
          cy.contains(modifiedExact);
          cy.realPress([H.metaKey, "z"]); // revert to prevent "unsaved changes" dialog
        });
        H.newButton("Document").click();
        H.documentContent().should("have.text", "");
        cy.realPress([H.metaKey, "z"]);
        H.documentContent().should("have.text", "");
      });

      it("should not clear undo history on save", () => {
        const originalText = "Lorem Ipsum and some more words";
        const originalExact = new RegExp(`^${originalText}$`);
        H.visitDocument("@documentId");
        cy.findByTestId("document-card-embed").should("contain", "37.65"); // wait for data loading
        H.documentContent().contains(originalExact).click();

        const modification = " etc.";
        const modifiedExact = new RegExp(`^${originalText}${modification}$`);
        H.addToDocument(modification, false);
        H.documentContent().contains(modifiedExact);

        cy.realPress([H.metaKey, "s"]);
        cy.findByTestId("toast-undo")
          .findByText("Document saved")
          .should("be.visible");

        cy.realPress([H.metaKey, "z"]);
        cy.realPress([H.metaKey, "z"]);
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
    });

    describe("Card Embeds", () => {
      beforeEach(() => {
        H.createQuestion(PRODUCTS_AVERAGE_BY_CATEGORY);
        H.createQuestion(ACCOUNTS_COUNT_BY_CREATED_AT);
        H.createQuestion(PIVOT_TABLE_CARD);
        H.createNativeQuestion(STEP_COLUMN_CARD);
        H.createNativeQuestion(SCALAR_CARD.LANDING_PAGE_VIEWS);
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
      });

      it("should support keyboard and mouse selection in suggestions without double highlight", () => {
        H.addPostgresDatabase();
        H.activateToken("pro-self-hosted");
        H.setupAnthropicLlmProvider();
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

      it("should support adding, editing, replacing, and resizing cards", () => {
        H.visitDocument("@documentId");
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

        H.entityPickerModalItem(1, PRODUCTS_AVERAGE_BY_CATEGORY.name).click();
        H.entityPickerModal().findByRole("button", { name: "Select" }).click();

        H.getDocumentCard(PRODUCTS_AVERAGE_BY_CATEGORY.name).should("exist");
        cy.realPress("{downarrow}");

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
        H.openDocumentCardMenu(PRODUCTS_COUNT_BY_CATEGORY_PIE.name);
        H.popover().findByText("Replace").click();

        H.modal().within(() => {
          cy.findByText("Choose a question or model").should("exist");

          cy.findAllByPlaceholderText("Search…").click().type("Orders");

          cy.findAllByTestId("result-item").findByText("Orders").click();

          cy.findByRole("button", { name: "Select" }).click();
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

        H.getDocumentCard("Orders").should("be.visible");

        cy.log("resize a card");
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

            // Unjustified type cast. FIXME
            expect(newHeight).to.be.lessThan(ogHeight as number);
          });
        });
      });

      it("should support renaming cards", () => {
        H.visitDocument("@documentId");

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

      const PADDING_CARD = 1;
      type ChartCard =
        | (StructuredQuestionDetails & { name: string })
        | (NativeQuestionDetails & { name: string });
      type ChartSpec = {
        label: string;
        card: ChartCard;
        paddingX: number;
        selector: string;
      };

      const isNativeQuestion = (
        question: ChartCard,
      ): question is NativeQuestionDetails & { name: string } =>
        "native" in question;

      const createQuestionForCard = (
        question: ChartCard,
        nameOverride?: string,
      ) => {
        const details = nameOverride
          ? { ...question, name: nameOverride }
          : question;
        return isNativeQuestion(details)
          ? H.createNativeQuestion(details)
          : H.createQuestion(details);
      };

      const chartTypes: ChartSpec[] = [
        {
          label: "line",
          card: ACCOUNTS_COUNT_BY_CREATED_AT,
          paddingX: 16 + PADDING_CARD,
          selector: "[data-testid='chart-container'] > :first-child",
        },
        {
          label: "pie",
          card: PRODUCTS_COUNT_BY_CATEGORY_PIE,
          paddingX: 14 + PADDING_CARD,
          selector: "[data-testid='chart-with-legend']",
        },
      ];

      const assertChartMatchesContainerWidth = (
        cardName: string,
        paddingX: number,
        selector: string,
      ) => {
        H.getDocumentCard(cardName).then(($card) => {
          const cardWidth = $card.width()!;
          cy.wrap($card).find(selector).as("chart");

          cy.get("@chart")
            .should("exist")
            .then(($chart) => {
              const width = $chart.width()!;
              expect(width + paddingX * 2).to.equal(cardWidth);
            });
        });
      };

      it("keeps chart widths in sync during flex resize", () => {
        const cardIds: Record<string, { firstId: number; secondId: number }> =
          {};

        // Create all questions first
        chartTypes.forEach(({ label, card }) => {
          const secondCardName = `${card.name} (copy)`;

          cy.then(() =>
            createQuestionForCard(card).then(({ body }) => {
              cardIds[label] = { firstId: body.id, secondId: 0 };
            }),
          );

          cy.then(() =>
            createQuestionForCard(card, secondCardName).then(({ body }) => {
              cardIds[label].secondId = body.id;
            }),
          );
        });

        cy.then(() => {
          const content = chartTypes.map(({ label }) => ({
            type: "resizeNode",
            attrs: {
              height: 350,
              minHeight: 280,
              _id: `flex-${label}`,
            },
            content: [
              {
                type: "flexContainer",
                attrs: {
                  _id: `flex-${label}-container`,
                  columnWidths: [50, 50],
                },
                content: [
                  {
                    type: "cardEmbed",
                    attrs: {
                      id: cardIds[label].firstId,
                      name: null,
                      _id: `flex-${label}-card-1`,
                    },
                  },
                  {
                    type: "cardEmbed",
                    attrs: {
                      id: cardIds[label].secondId,
                      name: null,
                      _id: `flex-${label}-card-2`,
                    },
                  },
                ],
              },
            ],
          }));

          return H.createDocument({
            name: "Flex chart width document",
            document: {
              type: "doc",
              content,
            },
            collection_id: null,
            idAlias: "flexDocumentId",
          });
        });

        cy.intercept("POST", "/api/card/*/query").as("cardQuery");

        H.visitDocument("@flexDocumentId");

        // Wait for every card query: two cards per chart type
        for (let i = 0; i < chartTypes.length * 2; i++) {
          cy.wait("@cardQuery", { timeout: 15000 });
        }

        chartTypes.forEach(({ card, paddingX, selector }) => {
          const firstCardName = card.name;
          const secondCardName = `${card.name} (copy)`;

          const firstCardChart =
            H.getDocumentCard(firstCardName).find(selector);
          const secondCardChart =
            H.getDocumentCard(secondCardName).find(selector);

          firstCardChart.should("exist");
          secondCardChart.should("exist");

          const flexContainer = H.getFlexContainerForCard(firstCardName);
          const handles = H.getResizeHandlesForFlexContianer(flexContainer);

          handles.eq(0).then(($handle) => {
            cy.wrap($handle).realMouseDown({
              button: "left",
              position: "center",
            });

            const steps = [10, 40, 60, -100, -10, -40, -60];
            steps.forEach((deltaX) => {
              cy.wrap($handle).realMouseMove(deltaX, 0, {
                position: "center",
              });

              assertChartMatchesContainerWidth(
                firstCardName,
                paddingX,
                selector,
              );
              assertChartMatchesContainerWidth(
                secondCardName,
                paddingX,
                selector,
              );
            });

            cy.wrap($handle).realMouseUp({
              button: "left",
              position: "center",
            });
          });
        });
      });

      it("should copy an added card on save", () => {
        H.visitDocument("@documentId");

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

      cy.log("Create a time series query in the notebook editor");
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders").click();
      });
      cy.findByRole("dialog", { name: "Create new question" })
        .findByText("Orders")
        .should("be.visible");

      H.addSummaryField({ metric: "Sum of ...", field: "Total" });
      H.addSummaryGroupingField({ field: "Created At" });

      cy.log("Save and use the new question");
      cy.findByRole("dialog", { name: "Create new question" })
        .findByRole("button", { name: "Save and use" })
        .click();

      cy.wait("@dataset");

      cy.log("Verify the question is embedded with a line chart visualization");
      H.getDocumentCard("Orders, Sum of Total, Grouped by Created At: Month")
        .should("be.visible")
        .within(() => {
          cy.findByTestId("chart-container").should("exist");
          cy.get("svg").should("exist");
          H.cartesianChartCircle().should("have.length.at.least", 1);
        });

      cy.get("@documentId").then((id) => {
        H.expectUnstructuredSnowplowEvent({
          event: "document_add_card",
          target_id: id,
        });
      });

      cy.log("Verify document can be saved with a new question");
      cy.findByRole("button", { name: "Save" }).should("be.visible").click();

      H.undoToast().findByText("Document saved").should("be.visible");
      cy.findByRole("button", { name: "Save" }).should("not.exist");
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
      cy.findByTestId("selected-database").should("be.visible");

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

      H.undoToast().findByText("Document saved").should("be.visible");
      cy.findByRole("button", { name: "Save" }).should("not.exist");
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

    it("should show block menus on hover and copy the anchor URL to clipboard", () => {
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

      cy.log("Comments menu shows alongside the anchor link menu");
      // Comments button uses ForwardRefLink, so it's a link role not button
      cy.findAllByTestId("comments-menu")
        .filter(":visible")
        .first()
        .findByRole("link", { name: /comments/i })
        .should("be.visible");

      // Filter to visible one since all blocks have hidden buttons
      cy.findAllByTestId("anchor-link-menu")
        .filter(":visible")
        .first()
        .findByRole("button", { name: /copy link/i })
        .should("be.visible")
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
      // dismiss after asserting so toasts don't stack into later lookups
      H.undoToast().icon("close").click({ force: true });
      H.undoToastList().should("have.length", 0);

      cy.log("Make another change");
      H.documentContent().click();
      H.addToDocument("More changes");
      H.documentSaveButton().click();
      cy.contains('[data-testid="toast-undo"]', "Document saved").should(
        "be.visible",
      );
      H.undoToast().icon("close").click({ force: true });
      H.undoToastList().should("have.length", 0);

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
        .closest('[data-testid="revision-history-event"]')
        .findByTestId("question-revert-button")
        .click();
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

      cy.log("Surface backend error when a revert fails (UXW-310)");
      cy.intercept("POST", "/api/revision/revert", {
        statusCode: 500,
        body: { message: "Cannot revert: missing document" },
      }).as("failedRevert");

      cy.findByTestId("document-history-list")
        .findAllByTestId("question-revert-button")
        .first()
        .click();
      cy.wait("@failedRevert");

      cy.contains(
        '[data-testid="toast-undo"]',
        "Cannot revert: missing document",
      ).should("be.visible");
    });
  });

  describe("timeline events on chart embeds", () => {
    const TIMESERIES_CARD_1 = "Orders, Count, Grouped by Created At (year)";
    const NON_TIMESERIES_CARD = "Orders, Count";
    const TIMESERIES_CARD_3 = "Orders by Created At (Month)";
    const TIMELINE_NAME = "Releases";
    const TIMELINE_EVENT_NAME = "RC1";

    it("should show the Events menu only on timeseries charts and manage per-chart timeline selection", () => {
      H.createTimelineWithEvents({
        timeline: { name: TIMELINE_NAME },
        events: [
          {
            name: TIMELINE_EVENT_NAME,
            timestamp: "2026-06-01T00:00:00Z",
            icon: "star",
            timezone: "UTC",
          },
        ],
      });

      H.createQuestion(ORDERS_COUNT_BY_CREATED_AT).then(
        ({ body: { id: timeseriesCard3Id } }) => {
          H.createDocument({
            name: "Timeline events document",
            document: {
              type: "doc",
              content: [
                {
                  type: "resizeNode",
                  attrs: { height: 350, minHeight: 280, _id: "1" },
                  content: [
                    {
                      type: "cardEmbed",
                      attrs: {
                        id: ORDERS_BY_YEAR_QUESTION_ID,
                        name: null,
                        _id: "1a",
                      },
                    },
                  ],
                },
                { type: "paragraph", attrs: { _id: "2" } },
                {
                  type: "resizeNode",
                  attrs: { height: 350, minHeight: 280, _id: "3" },
                  content: [
                    {
                      type: "cardEmbed",
                      attrs: {
                        id: ORDERS_COUNT_QUESTION_ID,
                        name: null,
                        _id: "3a",
                      },
                    },
                  ],
                },
                { type: "paragraph", attrs: { _id: "4" } },
                {
                  type: "resizeNode",
                  attrs: { height: 350, minHeight: 280, _id: "5" },
                  content: [
                    {
                      type: "cardEmbed",
                      attrs: {
                        id: timeseriesCard3Id,
                        name: null,
                        _id: "5a",
                      },
                    },
                  ],
                },
                { type: "paragraph", attrs: { _id: "6" } },
              ],
            },
            collection_id: null,
            idAlias: "timelineDocumentId",
          });
        },
      );

      cy.intercept("POST", "/api/card/*/query").as("cardQuery");

      H.visitDocument("@timelineDocumentId");

      cy.wait(["@cardQuery", "@cardQuery", "@cardQuery"]);

      H.getDocumentCard(TIMESERIES_CARD_1)
        .findByTestId("chart-container")
        .should("exist");
      H.getDocumentCard(NON_TIMESERIES_CARD)
        .findByTestId("visualization-root")
        .should("exist");
      H.getDocumentCard(TIMESERIES_CARD_3)
        .findByTestId("chart-container")
        .should("exist");

      cy.log("Events menu appears for timeseries chart 1, not for chart 2");
      H.openDocumentCardMenu(TIMESERIES_CARD_1);
      H.popover()
        .findByRole("menuitem", { name: /Events/ })
        .should("be.visible");
      cy.realPress("Escape");

      H.openDocumentCardMenu(NON_TIMESERIES_CARD);
      H.popover()
        .findByRole("menuitem", { name: /Edit Visualization/ })
        .should("be.visible");
      H.popover()
        .findByRole("menuitem", { name: /Events/ })
        .should("not.exist");
      cy.realPress("Escape");

      cy.log("Add timeline to chart 1");
      H.openDocumentCardMenu(TIMESERIES_CARD_1);
      H.popover()
        .findByRole("menuitem", { name: /Events/ })
        .click();

      documentTimelineSidebar().should("be.visible");
      documentTimelineHeaderCheckbox(TIMELINE_NAME)
        .should("not.be.checked")
        .click();
      documentTimelineHeaderCheckbox(TIMELINE_NAME).should("be.checked");

      documentCardTimelineEventChip(
        TIMESERIES_CARD_1,
        TIMELINE_EVENT_NAME,
      ).should("be.visible");

      cy.log("Open timeline sidebar by clicking event chip");
      closeDocumentTimelineSidebar();
      documentTimelineSidebar().should("not.exist");

      H.getDocumentCard(TIMESERIES_CARD_1)
        .findByTestId("timeline-event-chip")
        .click();

      documentTimelineSidebar().should("be.visible");

      cy.log("Chart 3 has independent timeline state");
      selectDocumentCard(TIMESERIES_CARD_3);

      documentTimelineHeaderCheckbox(TIMELINE_NAME).should("not.be.checked");
      documentCardTimelineEventChip(
        TIMESERIES_CARD_3,
        TIMELINE_EVENT_NAME,
      ).should("not.exist");

      cy.log("Remove timeline from chart 1");
      selectDocumentCard(TIMESERIES_CARD_1);

      documentTimelineHeaderCheckbox(TIMELINE_NAME)
        .should("be.checked")
        .click();
      documentTimelineHeaderCheckbox(TIMELINE_NAME).should("not.be.checked");
      documentCardTimelineEventChip(
        TIMESERIES_CARD_1,
        TIMELINE_EVENT_NAME,
      ).should("not.exist");
    });
  });
});

function documentTimelineSidebar() {
  return cy.findByTestId("document-timeline-sidebar");
}

function documentTimelineHeaderCheckbox(timelineName: string) {
  return documentTimelineSidebar()
    .findAllByLabelText("Timeline card header")
    .filter((_, el) => el.textContent?.includes(timelineName) ?? false)
    .should("have.length", 1)
    .findByRole("checkbox");
}

function closeDocumentTimelineSidebar() {
  return documentTimelineSidebar().findByLabelText("Close").click();
}

function selectDocumentCard(cardName: string) {
  return H.getDocumentCard(cardName).click("top");
}

function documentCardTimelineEventChip(cardName: string, eventName: string) {
  return H.getDocumentCard(cardName).findByRole("button", {
    name: eventName,
  });
}

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

function duplicateAndAssertRedirect() {
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
}
