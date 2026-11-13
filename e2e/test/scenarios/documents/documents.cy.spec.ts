import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { ORDERS_BY_YEAR_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ACCOUNTS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_AVERAGE_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
} from "e2e/support/test-visualization-data";
import type {
  CollectionId,
  CollectionPermission,
  CollectionPermissions,
} from "metabase-types/api";

const { H } = cy;

const { ALL_USERS_GROUP, COLLECTION_GROUP, DATA_GROUP } = USER_GROUPS;

describe("documents", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.resetSnowplow();
  });

  it("should create and save a document that persists after a reload, and manage it from the collection list", () => {
    cy.visit("/");

    H.newButton("Document").click();

    cy.findByRole("textbox", { name: "Document Title" }).type("Test Document");

    H.documentContent().type("This is a paragraph\nAnd this is another");

    cy.findByRole("button", { name: "Save" }).click();

    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalItem(1, "First collection").click();
    H.entityPickerModal().findByRole("button", { name: "Select" }).click();

    cy.location("pathname").should("eq", "/document/1");
    H.documentSaveButton().should("not.exist");

    cy.reload();

    cy.findByRole("textbox", { name: "Document Title" }).should(
      "have.value",
      "Test Document",
    );
    H.documentContent()
      .should("contain.text", "This is a paragraph")
      .and("contain.text", "And this is another");

    cy.findByLabelText("More options").click();
    H.popover().findByText("History").click();
    cy.findByTestId("document-history-list")
      .findByText(/created this/)
      .should("be.visible");
    H.sidesheet().findByLabelText("Close").click();
    H.sidesheet().should("not.exist");

    // The reload reopens the navbar, which hides the breadcrumbs
    H.closeNavigationSidebar();
    H.appBar()
      .findByRole("link", { name: /First collection/ })
      .click();

    H.collectionTable()
      .findByRole("link", { name: "Test Document" })
      .should("exist");

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

    cy.location("pathname").should("equal", "/document/1-test-document");
    H.documentContent().should("contain.text", "This is a paragraph");

    // breadcrumbs are hidden while the navbar is open
    H.closeNavigationSidebar();
    H.appBar()
      .findByRole("link", { name: /Our analytics/ })
      .click();

    H.openCollectionItemMenu("Test Document");

    H.popover().findByText("Duplicate").click();
    cy.findByRole("heading", { name: 'Duplicate "Test Document"' }).should(
      "exist",
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
    cy.findByTestId("archive-banner").should("be.visible");
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
        idAlias: "documentId",
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

      it("should support adding, renaming, replacing and resizing cards and updating viz settings", () => {
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

        cy.log("resize a card");
        H.getDocumentCard(ACCOUNTS_COUNT_BY_CREATED_AT.name).then(($card) => {
          // Unjustified type cast. FIXME
          const ogHeight = $card.height() as number;
          const resizeNode = H.getDocumentCardResizeContainer(
            ACCOUNTS_COUNT_BY_CREATED_AT.name,
          );

          H.documentDoDrag(H.getDragHandleForDocumentResizeNode(resizeNode), {
            y: 200,
          });

          H.getDocumentCard(ACCOUNTS_COUNT_BY_CREATED_AT.name).should(
            ($resized) => {
              expect($resized.height()).to.be.closeTo(ogHeight + 200, 3);
            },
          );
        });

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

        cy.log("edit the query of an unnamed card");
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

        cy.log("rename a card");
        H.getDocumentCard(PRODUCTS_COUNT_BY_CATEGORY_PIE.name).realHover();
        H.getDocumentCard(PRODUCTS_COUNT_BY_CATEGORY_PIE.name)
          .find(".Icon-pencil")
          .click();
        cy.realType("New name{enter}");

        cy.log("edit the query of a renamed card");
        H.openDocumentCardMenu("New name");
        H.getDocumentCard("New name")
          .findByRole("list")
          .findAllByRole("listitem")
          .should("have.length", 7);
        H.popover().findByText("Edit Query").click();

        H.removeSummaryGroupingField({ field: "Price: Auto binned" });
        H.addSummaryGroupingField({ field: "Category" });
        H.modal().findByRole("button", { name: "Save and use" }).click();

        cy.log("the new name is preserved after editing the query");
        H.getDocumentCard("New name")
          .findByRole("list")
          .findAllByRole("listitem")
          .should("have.length", 4);

        //Replace Card
        H.openDocumentCardMenu("New name");
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
          .contains("New name")
          .should("not.exist");

        H.getDocumentCard("Orders").should("exist");
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

        cy.location("pathname")
          .should("match", /^\/question\/\d+/)
          .then((pathname) => {
            const [, questionId] = pathname.match(/^\/question\/(\d+)/)!;
            expect(Number(questionId)).not.to.equal(ORDERS_BY_YEAR_QUESTION_ID);
          });

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
        idAlias: "documentId",
      });

      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("should create notebook questions, including a time series line chart, and a native SQL question, embed them in the document and save it", () => {
      cy.intercept("GET", "/api/database").as("database");
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

      cy.log("time series aggregation gets a line chart");
      H.documentContent()
        .find(".node-paragraph")
        .should("have.length.at.least", 1)
        .last()
        .click();

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

      cy.log("native SQL question");
      // The `document_add_card` assertion below counts only the native card
      H.resetSnowplow();
      cy.intercept("POST", "/api/dataset").as("nativeDataset");
      H.documentContent()
        .find(".node-paragraph")
        .should("have.length.at.least", 1)
        .last()
        .click();

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

      cy.wait("@nativeDataset");

      cy.log("Verify the SQL query is embedded in the document");
      H.getDocumentCard("New question").should("exist");

      cy.log("Verify document can be saved with new questions");
      cy.findByRole("button", { name: "Save" })
        .scrollIntoView()
        .should("be.visible")
        .click();
      cy.findByRole("button", { name: "Save" }).should("not.exist");
      H.undoToast().findByText("Document saved").should("exist");

      cy.get("@documentId").then((id) => {
        H.expectUnstructuredSnowplowEvent({
          event: "document_add_card",
          target_id: id,
        });
      });

      cy.log("Change native question title");
      H.getDocumentCard("New question").within(() => {
        cy.findByText("New question").realHover();
        cy.icon("pencil").click();
      });
      cy.realType("New native question");
      cy.get(".node-paragraph").first().click(); // unfocus cardEmbed

      H.getDocumentCard("New native question").should("be.visible");

      cy.log("Verify document can be saved with a renamed question");
      cy.findByRole("button", { name: "Save" })
        .scrollIntoView()
        .should("be.visible")
        .click();
      cy.findByRole("button", { name: "Save" }).should("not.exist");

      H.undoToast().findByText("Document saved").should("exist");
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
        idAlias: "documentId",
      });
    });

    it("should scroll to the anchor hash block", () => {
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

  describe("timeline events on chart embeds", () => {
    const TIMESERIES_CARD_3 = "Orders by Created At (Month)";
    const TIMELINE_NAME = "Releases";
    const TIMELINE_EVENT_NAME = "RC1";
    const TIMESERIES_CARD_1 = "Orders, Count, Grouped by Created At (year)";

    it("should show a timeline on a timeseries chart embed from the Events menu", () => {
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
          ],
        },
        collection_id: null,
        idAlias: "timelineDocumentId",
      });

      H.visitDocument("@timelineDocumentId");
      H.getDocumentCard(TIMESERIES_CARD_1)
        .findByTestId("chart-container")
        .should("exist");

      H.openDocumentCardMenu(TIMESERIES_CARD_1);
      H.popover()
        .findByRole("menuitem", { name: /Events/ })
        .click();

      cy.findByTestId("document-timeline-sidebar")
        .findByLabelText("Timeline card header")
        .findByRole("checkbox")
        .click();

      H.getDocumentCard(TIMESERIES_CARD_1)
        .findByRole("button", { name: TIMELINE_EVENT_NAME })
        .should("be.visible");
    });

    it("should save a document after editing the visualization of an embed whose timeline the user cannot read", () => {
      H.createCollection({ name: "Private" }).then(
        ({ body: { id: collectionId } }) => {
          H.createTimelineWithEvents({
            timeline: { name: TIMELINE_NAME, collection_id: collectionId },
            events: [
              {
                name: TIMELINE_EVENT_NAME,
                timestamp: "2026-06-01T00:00:00Z",
                icon: "star",
                timezone: "UTC",
              },
            ],
          }).then(({ timeline }) => {
            cy.updateCollectionGraph(denyCollection(collectionId));
            H.createQuestion({
              ...ORDERS_COUNT_BY_CREATED_AT,
              visualization_settings: {
                ...ORDERS_COUNT_BY_CREATED_AT.visualization_settings,
                "timeline.selected_timeline_ids": [timeline.id],
              },
            }).then(({ body: { id: questionId } }) => {
              cy.signInAsNormalUser();
              H.createDocument({
                name: "Private timeline document",
                document: {
                  type: "doc",
                  content: [
                    {
                      type: "resizeNode",
                      attrs: { height: 350, minHeight: 280, _id: "1" },
                      content: [
                        {
                          type: "cardEmbed",
                          attrs: { id: questionId, name: null, _id: "1a" },
                        },
                      ],
                    },
                    { type: "paragraph", attrs: { _id: "2" } },
                  ],
                },
                collection_id: null,
                idAlias: "privateTimelineDocumentId",
              });
            });
          });
        },
      );

      H.visitDocument("@privateTimelineDocumentId");

      H.openDocumentCardMenu(TIMESERIES_CARD_3);
      H.popover()
        .findByRole("menuitem", { name: /Edit Visualization/ })
        .click();

      H.getDocumentSidebar().findByRole("button", { name: /Line/i }).click();
      cy.findByRole("menu", { name: /Line/i }).findByText("Bar").click();
      H.getDocumentSidebar().findByRole("button", { name: "Done" }).click();

      cy.intercept("PUT", "/api/document/*").as("saveDocument");
      H.documentSaveButton().click();
      cy.wait("@saveDocument").its("response.statusCode").should("eq", 200);
      H.documentSaveButton().should("not.exist");
      H.assertDocumentCardVizType(TIMESERIES_CARD_3, "Bar");
    });
  });

  describe("metabot (#73690)", () => {
    const GENERATED_CARD_NAME = "Feature requests mentioned twice";
    const MOCK_LLM_PORT = 6124;

    beforeEach(() => {
      cy.task("startMockLlmServer", {
        port: MOCK_LLM_PORT,
        toolCall: {
          name: "document_construct_sql_chart",
          input: {
            database_id: SAMPLE_DB_ID,
            name: GENERATED_CARD_NAME,
            description: "Feature requests mentioned at least twice.",
            analysis: "Count orders for a deterministic e2e chart.",
            approach:
              "Use a simple aggregate query against the sample database.",
            sql: "SELECT COUNT(*) AS count FROM ORDERS",
            viz_settings: { chart_type: "bar" },
          },
        },
      });
      H.setupAnthropicLlmProvider({
        baseUrl: `http://localhost:${MOCK_LLM_PORT}`,
      });
    });

    afterEach(() => {
      cy.task("stopMockLlmServer");
    });

    it("should create a chart from a document Metabot block", () => {
      H.createDocument({
        name: "Document Metabot Chart",
        document: {
          content: [
            {
              type: "metabot",
              content: [
                {
                  type: "text",
                  text: "create a chart using issue customer mention",
                },
              ],
            },
          ],
          type: "doc",
        },
        collection_id: null,
        idAlias: "documentId",
      });

      H.visitDocument("@documentId");

      cy.findByRole("button", { name: "Run" }).click();

      H.getDocumentCard(GENERATED_CARD_NAME).should("be.visible");
      H.documentContent().should(
        "contain.text",
        "Feature requests mentioned at least twice.",
      );
      H.documentContent().should("contain.text", "Created with Metabot");
    });
  });
});

function denyCollection(id: CollectionId): CollectionPermissions {
  const denied: Record<CollectionId, CollectionPermission> = { [id]: "none" };
  return {
    [ALL_USERS_GROUP]: denied,
    [COLLECTION_GROUP]: denied,
    [DATA_GROUP]: denied,
  };
}
