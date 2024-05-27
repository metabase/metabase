import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import {
  restore,
  visitQuestionAdhoc,
  popover,
  echartsContainer,
  chartPathWithFillColor,
  testPairedTooltipValues,
} from "e2e/support/helpers";

const questionDetails = {
  name: "27279",
  native: {
    query:
      "select -3 o, 'F2021' k, 1 v\nunion all select -2, 'V2021', 2\nunion all select -1, 'S2022', 3\nunion all select 0, 'F2022', 4",
    "template-tags": {},
  },
  visualization_settings: {
    "table.pivot_column": "O",
    "table.cell_column": "V",
  },
};

describe("issue 27279", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should reflect/apply sorting to the x-axis (metabase#27279)", () => {
    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          query: {
            "source-table": `card__${id}`,
            aggregation: [
              ["sum", ["field", "V", { "base-type": "type/Integer" }]],
            ],
            breakout: [
              ["field", "K", { "base-type": "type/Text" }],
              ["field", "O", { "base-type": "type/Integer" }],
            ],
            "order-by": [
              ["asc", ["field", "O", { "base-type": "type/Integer" }]],
            ],
          },
          database: SAMPLE_DB_ID,
        },
        display: "bar",
        visualization_settings: {
          "graph.dimensions": ["K", "O"],
          "graph.metrics": ["sum"],
        },
      });
    });

    const legendItems = ["-3", "-2", "-1", "0"];
    compareValuesInOrder(cy.findAllByTestId("legend-item"), legendItems);

    // need to add a single space on either side of the text as it is used as padding
    // in ECharts
    const xAxisTicks = ["F2021", "V2021", "S2022", "F2022"].map(
      str => ` ${str} `,
    );
    compareValuesInOrder(
      echartsContainer()
        .get("text")
        .contains(/F2021|V2021|S2022|F2022/),
      xAxisTicks,
    );

    // Extra step, just to be overly cautious
    chartPathWithFillColor("#98D9D9").realHover();
    popover().within(() => {
      testPairedTooltipValues("K", "F2021");
      testPairedTooltipValues("O", "-3");
      testPairedTooltipValues("Sum of V", "1");
    });

    chartPathWithFillColor("#509EE3").realHover();
    popover().within(() => {
      testPairedTooltipValues("K", "F2022");
      testPairedTooltipValues("O", "0");
      testPairedTooltipValues("Sum of V", "4");
    });
  });
});

function compareValuesInOrder(selector, values) {
  selector.each(($item, index) => {
    cy.wrap($item).invoke("text").should("eq", values[index]);
  });
}
