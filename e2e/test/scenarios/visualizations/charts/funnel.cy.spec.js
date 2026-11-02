const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE_ID, PEOPLE, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > funnel chart", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [["count"]],
          breakout: [["field", PEOPLE.SOURCE]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "funnel",
    });
    H.openVizSettingsSidebar();
    H.sidebar().findByText("Data").click();
  });

  it("should allow you to reorder and show/hide rows, and handle row items being filtered out and returned", () => {
    cy.log("ensure that rows are shown");
    H.getDraggableElements().should("have.length", 5);

    H.getDraggableElements()
      .first()
      .invoke("text")
      .then((name) => {
        cy.log(`mode row ${name} down 2`);
        cy.findAllByTestId("funnel-chart-header")
          .first()
          .should("have.text", name);

        H.getDraggableElements().first().as("dragElement");
        H.moveDnDKitElementByAlias("@dragElement", {
          vertical: 100,
          useMouseEvents: true,
        });

        H.getDraggableElements().eq(2).should("have.text", name);

        cy.findAllByTestId("funnel-chart-header")
          .eq(2)
          .should("have.text", name);
      });

    cy.log("toggle row visibility");
    H.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click({ force: true });
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 4);

    H.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_crossed_out").click({ force: true });
      });
    cy.findAllByTestId("funnel-chart-header").should("have.length", 5);

    cy.log("filter rows out and return them");
    H.getDraggableElements()
      .eq(1)
      .within(() => {
        cy.icon("eye_outline").click({ force: true });
      });

    H.filter();
    H.popover().findByText("Source").click();
    H.selectFilterOperator("Is not");
    H.popover().within(() => {
      cy.findByText("Facebook").click();
      cy.button("Apply filter").click();
    });

    H.getDraggableElements().should("have.length", 4);
    cy.findAllByTestId("funnel-chart-header").should("have.length", 3);

    //Ensures that "Google" is still hidden, so it's state hasn't changed.
    H.getDraggableElements()
      .eq(0)
      .within(() => {
        cy.icon("eye_crossed_out").click({ force: true });
      });

    cy.log("remove filter");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.icon("close").click();
    });

    H.getDraggableElements().should("have.length", 5);

    //Re-added items should appear at the end of the list.
    H.getDraggableElements().eq(0).should("have.text", "Google");
    H.getDraggableElements().eq(4).should("have.text", "Facebook");
  });
});

describe("scenarios > visualizations > funnel chart > filters and empty values", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  describe("issue 17524", () => {
    const nativeQuestionDetails = {
      native: {
        query:
          "select * from (\nselect 'A' step, 41 users, 42 median union all\nselect 'B' step, 31 users, 32 median union all\nselect 'C' step, 21 users, 22 median union all\nselect 'D' step, 11 users, 12 median\n) x\n[[where users>{{num}}]]\n",
        "template-tags": {
          num: {
            id: "d7f1fb15-c7b8-6051-443d-604b6ed5457b",
            name: "num",
            "display-name": "Num",
            type: "number",
            default: null,
          },
        },
      },
      display: "funnel",
      visualization_settings: {
        "funnel.dimension": "STEP",
        "funnel.metric": "USERS",
      },
    };

    const questionDetails = {
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      display: "funnel",
      visualization_settings: {
        "funnel.metric": "count",
        "funnel.dimension": "CATEGORY",
      },
    };

    describe("scenario 1", () => {
      beforeEach(() => {
        H.createNativeQuestion(nativeQuestionDetails, { visitQuestion: true });
      });

      it("should not alter visualization type when applying filter on a native question (metabase#17524-1)", () => {
        cy.intercept("POST", "/api/card/*/query").as("cardQuery");

        H.filterWidget().type("20");

        // eslint-disable-next-line metabase/no-unsafe-element-filtering
        cy.icon("play").last().click();
        cy.wait("@cardQuery");

        cy.findAllByTestId("funnel-chart-header").should("have.length", 3);
        H.queryBuilderHeader().button("Save").should("not.exist");
      });
    });

    describe("scenario 2", () => {
      beforeEach(() => {
        H.createQuestion(questionDetails, { visitQuestion: true });
      });

      it("should not alter visualization type when applying filter on a QB question (metabase#17524-2)", () => {
        cy.intercept("POST", "/api/dataset").as("dataset");
        cy.findAllByTestId("funnel-chart-header").should("have.length", 4);

        H.filter();
        H.popover().findByText("Category").click();
        H.selectFilterOperator("Is not");
        H.popover().within(() => {
          cy.findByText("Gadget").click();
          cy.button("Apply filter").click();
        });
        cy.wait("@dataset");

        cy.findAllByTestId("funnel-chart-header").should("have.length", 3);
      });
    });
  });

  describe("issue 45255", () => {
    beforeEach(() => {
      H.visitQuestionAdhoc({
        dataset_query: {
          type: "native",
          native: {
            query:
              "select 'foo' step, 10 v union all select 'baz', 8 union all select null, 6 union all select 'bar', 4",
            "template-tags": {},
          },
          database: SAMPLE_DB_ID,
        },
        display: "funnel",
      });
    });

    it("should work on native queries with null dimension values (metabase#45255)", () => {
      H.openVizSettingsSidebar();

      // Has (empty) in the settings sidebar
      H.sidebar().findByText("(empty)");

      // Can reorder (empty)
      H.getDraggableElements().eq(2).should("have.text", "(empty)");
      H.getDraggableElements().first().as("dragElement");
      H.moveDnDKitElementByAlias("@dragElement", {
        vertical: 100,
        useMouseEvents: true,
      });
      H.getDraggableElements().eq(1).should("have.text", "(empty)");

      // Has (empty) in the chart
      cy.findByTestId("funnel-chart").findByText("(empty)");
    });
  });
});
