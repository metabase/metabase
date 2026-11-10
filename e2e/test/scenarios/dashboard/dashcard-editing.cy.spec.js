const { H } = cy;
import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  READ_ONLY_PERSONAL_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockHeadingDashboardCard,
  createMockParameter,
} from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard cards > undo", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it(
    "when undoing a dashcard removal or dashcard tab movement, it should try to restore the position (best effort)",
    { scrollBehavior: false },
    () => {
      const checkOrder = () => {
        H.getDashboardCard(0).findByText("Text card 1");
        H.getDashboardCard(1).findByText("Text card 2");
        H.getDashboardCard(2).findByText("Text card 3");
        H.getDashboardCard(3).findByText("Text card 4");
      };

      const getPositions = ($grid) => {
        const gridRect = $grid[0].getBoundingClientRect();
        return $grid
          .find("[data-testid='dashcard-container']")
          .toArray()
          .map((dashcard) => {
            const rect = dashcard.getBoundingClientRect();
            return {
              left: Math.round(rect.left - gridRect.left),
              top: Math.round(rect.top - gridRect.top),
            };
          });
      };

      const checkPositions = () => {
        cy.get("@originalPositions").then((originalPositions) => {
          H.dashboardGrid().should(($grid) => {
            expect(getPositions($grid)).to.deep.equal(originalPositions);
          });
        });
      };

      const cards = [
        H.getTextCardDetails({
          text: "Text card 1",
          size_x: 4,
          size_y: 1,
          row: 0,
          col: 1,
        }),
        H.getTextCardDetails({
          text: "Text card 2",
          size_x: 4,
          size_y: 1,
          row: 1,
          col: 0,
        }),
        H.getTextCardDetails({
          text: "Text card 3",
          size_x: 4,
          size_y: 1,
          row: 2,
          col: 3,
        }),
        H.getTextCardDetails({
          text: "Text card 4",
          size_x: 4,
          size_y: 1,
          row: 3,
          col: 0,
        }),
      ];

      H.createDashboard().then(({ body: { id: dashboard_id } }) => {
        H.updateDashboardCards({ dashboard_id, cards });

        H.visitDashboard(dashboard_id);
      });

      checkOrder();

      H.editDashboard();
      H.dashboardGrid().then(getPositions).as("originalPositions");

      for (let i = 0; i < cards.length; i++) {
        H.removeDashboardCard(i);
        H.getDashboardCards().should("have.length", cards.length - 1);

        H.undo();
        H.getDashboardCards().should("have.length", cards.length);
        checkOrder();
        checkPositions();
        // Seems to be needed to allow the UI to catch up before hovering the next element.
        // TODO: improve this.
        cy.wait(200);
      }

      H.createNewTab();
      H.goToTab("Tab 1");

      for (let i = 0; i < cards.length; i++) {
        H.moveDashCardToTab({ dashcardIndex: i, tabName: "Tab 2" });
        H.getDashboardCards().should("have.length", cards.length - 1);

        H.undo();
        H.getDashboardCards().should("have.length", cards.length);
        checkOrder();
        checkPositions();
        cy.wait(200);
      }
    },
  );
});

const CATEGORY_FILTER = createMockParameter({
  id: "1",
  name: "Category",
  type: "string/=",
});

describe("scenarios > dashboard cards > sections", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      parameters: [CATEGORY_FILTER],
    });
    H.visitDashboard(ORDERS_DASHBOARD_ID);
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should add sections and select a question for an empty card", () => {
    H.editDashboard();

    H.getDashboardCards().should("have.length", 1);
    addSection("KPIs w/ large chart below");
    H.getDashboardCards().should("have.length", 7);

    cy.findByPlaceholderText(
      "You can connect widgets to {{variables}} in heading cards.",
    ).type("This is a heading");
    selectQuestion("Orders, Count");

    H.createNewTab();
    H.getDashboardCards().should("have.length", 0);
    addSection("KPI grid");
    H.getDashboardCards().should("have.length", 5);

    // Verify placeholder cards can be dragged (metabase#UXW-3387)
    assertPlaceholderCardCanBeDragged();

    selectQuestion("Orders, Count, Grouped by Created At (year)");

    overwriteSectionDashCardTitle(
      1,
      "Orders, Count, Grouped by Created At (year)",
      "Line chart",
    );
    // TODO: if the mapping is done before the title is changed, the mapping is lost
    mapDashCardToFilter(H.getDashboardCard(1), "Category");

    H.goToTab("Tab 1");
    H.saveDashboard();

    H.dashboardGrid().within(() => {
      H.getDashboardCards().should("have.length", 7);
      cy.findAllByText("Select question").should("have.length", 0);

      cy.findByText("This is a heading").should("exist");
      cy.findByText("Orders, Count").should("exist");
      cy.findByText("Orders").should("exist");

      cy.findByText("Line chart").should("not.exist");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );
    });

    H.goToTab("Tab 2");

    H.dashboardGrid().within(() => {
      H.getDashboardCards().should("have.length", 5);
      cy.findAllByText("Select question").should("have.length", 0);

      cy.findByText("Line chart").should("exist");

      cy.findByText("This is a heading").should("not.exist");
      cy.findByText("Orders, Count").should("not.exist");
      cy.findByText("Orders").should("not.exist");
      cy.findByText("Orders, Count, Grouped by Created At (year)").should(
        "not.exist",
      );
    });

    // Ensure parameter mapping is persisted
    H.editDashboard();
    // Empty placeholders still exist, but only edit mode shows their button
    H.dashboardGrid().findAllByText("Select question").should("have.length", 3);
    filterPanel().findByText("Category").click();
    H.getDashboardCard(1).findByText("Product.Category").should("exist");
  });
});

describe("scenarios > dashboard cards > sections > read only collections", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("readonly");
    cy.intercept("GET", "/api/collection/*/items*").as("getCollectionItems");
  });

  it("Should allow you to select entities in collections you have read access to (metabase#50602)", () => {
    H.createDashboard({ collection_id: READ_ONLY_PERSONAL_COLLECTION_ID }).then(
      ({ body }) => {
        H.visitDashboard(body.id);
      },
    );

    H.editDashboard();
    addSection("KPIs w/ large chart below");
    H.dashboardGrid()
      .findAllByText("Select question")
      .first()
      .click({ force: true });
    cy.wait(["@getCollectionItems", "@getCollectionItems"]);
    H.pickEntity({ path: ["Our analytics", "Orders, Count"] });
    H.dashboardGrid().findByText("Orders, Count").should("exist");
  });
});

function addSection(name) {
  cy.findByLabelText("Add section").click();
  H.menu().findByLabelText(name).click();
}

function selectQuestion(question) {
  H.dashboardGrid()
    .findAllByText("Select question")
    .first()
    .click({ force: true });
  H.pickEntity({ path: ["Our analytics", question] });
  cy.wait("@cardQuery");
  H.dashboardGrid().findByText(question).should("exist");
}

function overwriteSectionDashCardTitle(index, originalTitle, newTitle) {
  H.showDashcardVisualizerModalSettings(index, {
    isVisualizerCard: false,
  });
  cy.findByDisplayValue(originalTitle).clear().type(newTitle).blur();
  H.saveDashcardVisualizerModalSettings();
}

function filterPanel() {
  return cy.findByTestId("edit-dashboard-parameters-widget-container");
}

function mapDashCardToFilter(dashcardElement, filterName) {
  filterPanel().findByText(filterName).click();
  H.selectDashboardFilter(dashcardElement, filterName);
  H.sidebar().button("Done").click();
}

function assertPlaceholderCardCanBeDragged() {
  H.getDashboardCards().then(($cards) => {
    const initialLeftValues = [...$cards].map(
      (card) => card.getBoundingClientRect().left,
    );

    const $target = $cards
      .filter((_i, card) =>
        card
          .querySelector("[data-testid='dashcard']")
          ?.textContent?.includes("Select question"),
      )
      .first();

    const rect = $target[0].getBoundingClientRect();

    cy.wrap($target)
      .trigger("mousedown", { button: 0, x: 10, y: 50 })
      .trigger("mousemove", {
        button: 0,
        clientX: rect.left + 900,
        clientY: rect.top + 200,
      })
      .wait(100)
      .trigger("mouseup");

    H.getDashboardCards().then(($afterCards) => {
      const afterLeftValues = [...$afterCards].map(
        (card) => card.getBoundingClientRect().left,
      );

      const someCardMoved = afterLeftValues.some(
        (left, i) => left !== initialLeftValues[i],
      );
      expect(someCardMoved).to.eq(true);
    });
  });
}

const PARAMETER = {
  DATE: createMockParameter({
    id: "1",
    name: "Created At",
    type: "date/all-options",
    sectionId: "date",
  }),
  CATEGORY: createMockParameter({
    id: "2",
    name: "Category",
    type: "string/=",
  }),
  UNUSED: createMockParameter({
    id: "3",
    name: "Not mapped to anything",
    type: "number/=",
    sectionId: "number",
  }),

  // Used to reproduce:
  // https://github.com/metabase/metabase/issues/36984
  DATE_2: createMockParameter({
    id: "2",
    name: "Created At (2)",
    type: "date/range",
    sectionId: "date",
  }),
};

const DASHBOARD_CREATE_INFO = {
  parameters: Object.values(PARAMETER),
};

// Question to be used as a reference for filters auto-wiring
const MAPPED_QUESTION_CREATE_INFO = {
  name: "Question with mapped parameters",
  query: { "source-table": PRODUCTS_ID },
};

const NEXT_QUESTION_CREATE_INFO = {
  name: "Next question",
  collection_id: FIRST_COLLECTION_ID,
  query: { "source-table": PRODUCTS_ID },
};

function getReplaceQuestionDashcards(mappedQuestionId) {
  const mappedQuestionDashcard = createMockDashboardCard({
    id: 2,
    card_id: mappedQuestionId,
    parameter_mappings: [
      {
        parameter_id: PARAMETER.DATE.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
      },
      {
        parameter_id: PARAMETER.DATE_2.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CREATED_AT, null]],
      },
      {
        parameter_id: PARAMETER.CATEGORY.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
    row: 1,
    size_x: 6,
    size_y: 4,
  });

  const targetDashcard = createMockDashboardCard({
    id: 3,
    card_id: ORDERS_COUNT_QUESTION_ID,
    row: 1,
    col: 6,
    size_x: 6,
    size_y: 4,
  });

  return [
    createMockHeadingDashboardCard({ id: 1, size_x: 24 }),
    mappedQuestionDashcard,
    targetDashcard,
  ];
}

describe("scenarios > dashboard cards > replace question", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    H.createQuestion(MAPPED_QUESTION_CREATE_INFO).then(
      ({ body: { id: mappedQuestionId } }) => {
        H.createQuestion(NEXT_QUESTION_CREATE_INFO).then(() => {
          H.createDashboard(DASHBOARD_CREATE_INFO).then(
            ({ body: { id: dashboardId } }) => {
              cy.request("PUT", `/api/dashboard/${dashboardId}`, {
                dashcards: getReplaceQuestionDashcards(mappedQuestionId),
              }).then(() => {
                cy.wrap(dashboardId).as("dashboardId");
              });
            },
          );
        });
      },
    );
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should undo the question replace action, then replace a dashboard card question (metabase#36984)", () => {
    visitDashboardAndEdit();

    overwriteTargetDashCardTitle("Custom name");
    connectDashboardFilter(findTargetDashcard(), {
      filterName: PARAMETER.UNUSED.name,
      columnName: "Discount",
    });

    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Orders",
    });
    findTargetDashcard().findByText("Product ID").should("exist");

    // There're two toasts: "Undo replace" and "Auto-connect"
    H.undoToastList()
      .should("have.length", 2)
      .eq(0)
      .should(($el) => {
        // we wait for element to take its position after animation
        expect($el.position().left).to.be.equal(0);
      })
      .button("Undo")
      .click();

    // Ensure we kept viz settings and parameter mapping changes from before
    findTargetDashcard().within(() => {
      assertDashCardTitle("Custom name");
      cy.findByText("18,760").should("exist");
      cy.findByText("Product ID").should("not.exist");
    });
    assertDashboardFilterMapping(findTargetDashcard(), {
      filterName: PARAMETER.UNUSED.name,
      expectedColumName: "Orders.Discount",
    });

    // Ensure changes are persisted
    H.saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Custom name");
      cy.findByText("18,760").should("exist");
      cy.findByText("Product ID").should("not.exist");
    });

    cy.log("metabase#36984");
    H.editDashboard();

    // Ensure can replace with a question
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Orders",
    });
    H.expectUnstructuredSnowplowEvent({ event: "dashboard_card_replaced" }, 2);
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders");
      cy.findByText("Product ID").should("exist");
    });

    // Ensure can replace with a model
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Orders Model",
    });
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders Model");
      cy.findByText("Product ID").should("exist");
      cy.findByText("User ID").should("exist");
    });

    // Ensure changes are persisted
    H.saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Orders Model");
      cy.findByText("Product ID").should("exist");
      cy.findByText("User ID").should("exist");
    });
  });

  it("should handle questions with limited permissions", () => {
    cy.updateCollectionGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
    });

    cy.signIn("nodata");
    visitDashboardAndEdit();

    // Replacing with a read-only question with limited data perms
    replaceQuestion(findTargetDashcard(), {
      nextQuestionName: "Next question",
      collectionName: "First collection",
    });
    findTargetDashcard().within(() => {
      assertDashCardTitle("Next question");
      cy.findByText("Ean").should("exist");
      cy.findByText("Rustic Paper Wallet").should("exist");
    });

    // Ensure changes are persisted
    H.saveDashboard();
    findTargetDashcard().within(() => {
      assertDashCardTitle("Next question");
      cy.findByText("Ean").should("exist");
      cy.findByText("Rustic Paper Wallet").should("exist");
    });
  });
});

function visitDashboardAndEdit() {
  H.visitDashboard("@dashboardId");
  cy.findByLabelText("Edit dashboard").click();
}

function findTargetDashcard() {
  return cy.findAllByTestId("dashcard").eq(2);
}

function replaceQuestion(
  dashcardElement,
  { nextQuestionName, collectionName },
) {
  dashcardElement.realHover().findByLabelText("Replace").click();
  H.entityPickerModal().within(() => {
    if (collectionName) {
      cy.findByText(collectionName).click();
    }
    cy.findByText(nextQuestionName).click();
  });
  cy.wait("@cardQuery");
}

function assertDashCardTitle(title) {
  cy.findByTestId("legend-caption-title").should("have.text", title);
}

function overwriteTargetDashCardTitle(textTitle) {
  findTargetDashcard()
    .realHover({ scrollBehavior: "bottom" })
    .findByLabelText("Show visualization options")
    .click();
  H.modal().within(() => {
    cy.findByLabelText("Title").type(`{selectall}{del}${textTitle}`).blur();
    cy.button("Done").click();
  });
}

function connectDashboardFilter(dashcardElement, { filterName, columnName }) {
  filterPanel().findByText(filterName).click();
  dashcardElement.button(/Select/).click();
  H.popover().findByText(columnName).click();
  filterPanel().findByText(filterName).click();
}

function assertDashboardFilterMapping(
  dashcardElement,
  { filterName, expectedColumName },
) {
  filterPanel().findByText(filterName).click();
  dashcardElement.findByText(expectedColumName).should("exist");
  filterPanel().findByText(filterName).click();
}

describe("scenarios > dashboard cards > visualization options", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should reorder columns in the visualization settings (metabase#16229)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.getDashboardCard().realHover();
    cy.findByLabelText("Show visualization options").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      H.getDraggableElements().contains("ID").as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: 100,
        useMouseEvents: true,
      });
    });
    // The ID column should be below the User ID column.
    H.getDraggableElements().should(($items) => {
      const columnNames = $items
        .toArray()
        .map((item) => item.dataset.testid.replace("draggable-item-", ""));
      expect(columnNames[0]).to.equal("User ID");
      expect(columnNames.indexOf("ID")).to.be.above(0);
    });
    // The table preview should get updated immediately, reflecting the changes in columns ordering.
    H.modal().findAllByRole("columnheader").first().contains("User ID");
    H.modal().button("Cancel").click();
    H.modal().should("not.exist");
  });
});

describe("issue 63416", () => {
  const questionDetails = {
    name: "63416 Question",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
      filter: [">=", ["field", ORDERS.CREATED_AT, null], "2027-01-01"],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const textFilter = createMockParameter({
      name: "Text",
      slug: "string",
      id: "5aefc726",
      type: "string/=",
      sectionId: "string",
    });

    H.createDashboardWithQuestions({
      dashboardDetails: {
        parameters: [textFilter],
      },
      questions: [questionDetails],
    }).then(({ dashboard, questions }) => {
      H.updateDashboardCards({
        dashboard_id: dashboard.id,
        cards: [
          {
            card_id: questions[0].id,
            parameter_mappings: [
              {
                parameter_id: textFilter.id,
                card_id: questions[0].id,
                target: [
                  "dimension",
                  [
                    "field",
                    PRODUCTS.CATEGORY,
                    {
                      "base-type": "type/Text",
                      "source-field": ORDERS.PRODUCT_ID,
                    },
                  ],
                  { "stage-number": 0 },
                ],
              },
            ],
          },
        ],
      });

      cy.wrap(dashboard.id).as("dashboardId");

      H.visitDashboard(dashboard.id);
    });
  });

  it("should download visualizer dashboard card without additional dataset with proper parameter values (metabase#63416)", function () {
    H.editDashboard();

    H.showDashcardVisualizerModalSettings(0, {
      isVisualizerCard: false,
    });

    cy.log("Make this a visualizer card");
    H.saveDashcardVisualizerModal();

    H.showDashboardCardActions(0);
    H.getDashboardCard(0).findByLabelText("Edit visualization").should("exist");

    H.saveDashboard();

    H.toggleFilterWidgetValues(["Doohickey"]);

    H.downloadAndAssert({
      fileType: "csv",
      isDashboard: true,
      downloadMethod: "POST",
      downloadUrl: `/api/dashboard/${this.dashboardId}/dashcard/*/card/*/query/csv`,
      assertParameters: [{ type: "string/=", value: ["Doohickey"] }],
    });
  });
});

describe("issue 64138", () => {
  const MAP_QUESTION = {
    query: {
      "source-table": PEOPLE_ID,
    },

    display: "map",
    displayIsLocked: true,
    visualization_settings: {
      "map.type": "pin",
      "map.pin_type": "markers",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestionAndDashboard({
      questionDetails: MAP_QUESTION,
    }).then(({ body: { dashboard_id } }) => {
      H.visitDashboard(dashboard_id);
    });
  });

  it("should hide map controls when editing dashboard (metabase#64138)", () => {
    H.editDashboard();

    cy.log("hovering the map should not show the zoom controls");
    H.getDashboardCard(0)
      .realHover({
        position: "center",
      })
      .within(() => {
        cy.findByLabelText("Zoom in").should("not.exist");
        // the update button is disabled until the map is panned, so only
        // assert that it is shown while the zoom controls are hidden
        cy.findByText("Set as default view").should("be.visible");
      });

    cy.log("hovering marker icons should not open their tooltips");
    getMarkerIcon(0).trigger("mousemove", { force: true });
    H.tooltip().should("not.exist");

    cy.log("clicking marker icons should not navigate to the question");
    getMarkerIcon(0).click({ force: true });
    cy.findByTestId("edit-bar").should("be.visible");
    getMarkerIcon(0).should("exist");
    cy.location("pathname").should("match", /^\/dashboard\/[0-9]+$/);
    H.modal().should("not.exist");

    cy.log(
      "outside of edit mode, the map shows its controls and handles markers",
    );
    cy.findByTestId("edit-bar").button("Cancel").click();
    H.getDashboardCard(0).findByLabelText("Zoom in").should("exist");
    getMarkerIcon(0).trigger("mousemove", { force: true });
    H.tooltip().should("be.visible");
    getMarkerIcon(0).click({ force: true });
    cy.location("pathname").should("match", /^\/question/);
    cy.location("search").should("match", /objectId=\d+/);
  });

  function getMarkerIcon(index) {
    // pick the last one so it will be on top
    return H.getDashboardCard(index)
      .find(".leaflet-marker-icon")
      .should("have.length.gt", 0)
      .last();
  }
});

describe("scenarios > dashboard > text and headings", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    H.visitDashboard(ORDERS_DASHBOARD_ID);
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should let you add a parameter to a dashboard with a long text box (metabase#8333, metabase#11927)", () => {
    H.addTextBox(
      "Lorem ipsum dolor sit amet,\n\nfoo\n\nbar\n\nbaz\n\nboo\n\nDonec quis enim porta.",
      { delay: 0.5 },
    );

    H.setFilter("Text or Category", "Is");

    H.selectDashboardFilter(cy.findAllByTestId("dashcard").first(), "Name");
    cy.findByTestId("edit-bar").findByText("Save").click();

    // confirm text box and filter are still there
    H.getDashboardCard(1)
      .contains("Lorem ipsum dolor sit amet,")
      .should("be.visible");
    cy.findByTestId("dashboard-parameters-widget-container")
      .findByText("Text")
      .should("be.visible");

    // scrollTo fails if the text card has no scroll bar
    H.getDashboardCard(1)
      .find(".text-card-markdown")
      .should("have.css", "overflow-x", "hidden")
      .should("have.css", "overflow-y", "auto")
      .scrollTo("bottom");
  });
});

describe("scenarios > dashboard > parameters in text and heading cards", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.createDashboard().then(({ body: { id: DASHBOARD_ID } }) => {
      H.visitDashboard(DASHBOARD_ID);
    });
  });

  it("should translate and localize parameter values into the instance language", () => {
    // Set user locale to English explicitly so that we can change the site locale separately, without the user
    // locale following it (by default, user locale matches site locale)
    cy.request("GET", "/api/user/current").then(({ body: { id: USER_ID } }) => {
      cy.request("PUT", `/api/user/${USER_ID}`, { locale: "en" });
    });
    H.updateSetting("site-locale", "en-ZZ");
    cy.reload();

    H.editDashboard();

    H.addTextBoxWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    H.addHeadingWhileEditing("Variable: {{foo}}", {
      parseSpecialCharSequences: false,
    });
    H.setFilter("Date picker", "Relative Date");

    H.getDashboardCard(0).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.getDashboardCard(1).findByText("Select…").click();
    H.popover().findByText("foo").click();

    H.saveDashboard();

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Today").click();
    });

    H.getDashboardCard(0)
      .findByText("Variable: [zz] Today")
      .should("be.visible");
    H.getDashboardCard(1)
      .findByText("Variable: [zz] Today")
      .should("be.visible");

    // Let's make sure the localization was reset back to the user locale by checking that specific text exists in
    // English on the homepage.
    cy.visit("/");

    cy.findByTestId("home-page").within(() => {
      cy.findByText("Pick up where you left off").should("be.visible");
      cy.findByText("[zz] Pick up where you left off").should("not.exist");
    });

    cy.log("date parameters use the instance locale");
    H.updateSetting("site-locale", "fr");

    // Create dashboard with a single date parameter, and a single question
    H.createQuestionAndDashboard({
      questionDetails: { query: { "source-table": PRODUCTS_ID } },
    }).then(({ body: card }) => {
      const { dashboard_id } = card;
      cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
        parameters: [
          createMockParameter({
            name: "Single Date",
            slug: "single_date",
            id: "ad1c877e",
            type: "date/single",
            sectionId: "date",
          }),
        ],
      });
      const updatedSize = {
        size_x: 11,
        size_y: 6,
      };
      H.editDashboardCard(card, updatedSize);
      H.visitDashboard(dashboard_id);

      H.editDashboard();

      // Create text card and connect parameter
      H.addTextBoxWhileEditing("Variable: {{foo}}", {
        parseSpecialCharSequences: false,
      });
      H.addHeadingWhileEditing("Variable: {{foo}}", {
        parseSpecialCharSequences: false,
      });

      cy.findByTestId("edit-dashboard-parameters-widget-container")
        .findByText("Single Date")
        .click();

      H.getDashboardCard(0).findByText("Select…").click();
      H.popover().findByText("Created At").click();

      H.getDashboardCard(1).findByText("Select…").click();
      H.popover().findByText("foo").click();

      H.getDashboardCard(2).findByText("Select…").click();
      H.popover().findByText("foo").click();

      H.saveDashboard();

      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("Single Date")
        .click();
      H.popover().within(() => {
        cy.findByRole("textbox").click().clear().type("07/19/2026").blur();
        cy.button("Add filter").click();
      });

      // Question should be filtered appropriately
      H.getDashboardCard(0).within(() => {
        cy.findByText("Rustic Paper Wallet").should("exist");
        cy.findByText("Small Marble Shoes").should("not.exist");
      });

      // Parameter value in widget should use user localization (English)
      cy.findByTestId("dashboard-parameters-widget-container")
        .findByText("July 19, 2026")
        .should("exist");

      // Parameter value in dashboard should use site localization (French)
      H.getDashboardCard(1)
        .findByText("Variable: juillet 19, 2026")
        .should("exist");
      H.getDashboardCard(2)
        .findByText("Variable: juillet 19, 2026")
        .should("exist");
    });
  });
});
