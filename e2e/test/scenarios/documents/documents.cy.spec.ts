import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_AVERAGE_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
} from "e2e/support/test-visualizer-data";

const { H } = cy;

H.describeWithSnowplowEE("documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resetSnowplow();
  });

  it("should allow you to create a new document from the new button and save", () => {
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
    cy.title().should("eq", "Test Document · Metabase");

    H.expectUnstructuredSnowplowEvent({ event: "document_created" });

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

    H.navigationSidebar()
      .findByRole("tab", { name: "Bookmarks" })
      .findByText("Test Document")
      .click();

    cy.location("pathname").should("equal", "/document/1-test-document");
    H.documentContent().should("contain.text", "This is a paragraph");

    H.appBar()
      .findByRole("link", { name: /Our analytics/ })
      .click();

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Move to trash").click();

    H.openNavigationSidebar();

    // Force the click since this is hidden behind a toast notification
    H.navigationSidebar().findByText("Trash").click({ force: true });
    H.getUnpinnedSection().findByText("Test Document").should("exist");
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
    H.leaveConfirmationModal().findByRole("button", { name: "Cancel" }).click();

    H.documentContent().should("have.text", "This is some content");

    H.newButton("Document").click();
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
              },
              {
                type: "cardEmbed",
                attrs: {
                  id: ORDERS_QUESTION_ID,
                  name: null,
                },
              },
              {
                type: "paragraph",
              },
            ],
            type: "doc",
          },
          collection_id: null,
          alias: "documentId",
        });
      });

      it("read only access", () => {
        cy.signIn("readonly");

        cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));

        H.documentContent()
          .findByRole("textbox")
          .should("have.attr", "contenteditable", "false");

        H.openDocumentCardMenu("Orders");
        H.popover().findAllByRole("menuitem").should("be.disabled");
      });

      it("no access", () => {
        cy.signIn("nocollection");

        cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));
        cy.findByRole("status").should(
          "contain.text",
          "Sorry, you don’t have permission to see that.",
        );
      });

      it("not found", () => {
        cy.get("@documentId").then((id) => cy.visit(`/document/${id + 1}`));
        H.main().within(() => {
          cy.findByText("We're a little lost...").should("exist");
          cy.findByText("The page you asked for couldn't be found.");
        });
      });

      it("should allow you to print", () => {
        cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));
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
        alias: "documentId",
      });

      cy.get("@documentId").then((id) => cy.visit(`/document/${id}`));
    });

    it("should support typing with a markdown syntax", () => {
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
          ({ body: { id } }) => cy.request(`/api/card/${id}`),
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

        H.getDocumentCard(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name).should(
          "not.exist",
        );
        H.getDocumentCard("Orders").should("exist");
      });

      it("should copy an added card on save", () => {
        cy.intercept({
          method: "PUT",
          path: "/api/ee/document/*",
        }).as("documentUpdate");
        cy.intercept({
          method: "GET",
          path: "/api/ee/document/*",
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
      });
    });
  });
});
