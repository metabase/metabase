import registerVisualizations from "metabase/visualizations/register";
import { createMockCard, createMockField } from "metabase-types/api/mocks";

import { convertCardToInitialState } from "./convert-question-to-initial-state";

registerVisualizations();

describe("convertQuestionToInitialState", () => {
  it("should work with a visualization supported by the visualizer", () => {
    expect(
      convertCardToInitialState(
        createMockCard({
          display: "line",
          visualization_settings: {
            "graph.show_values": true,
            "graph.label_value_frequency": "fit",
            "graph.dimensions": ["CREATED_AT"],
            column_settings: {
              '["name","count"]': {
                number_style: "currency",
                currency_style: "code",
              },
            },
            "graph.metrics": ["count"],
          },
          result_metadata: [
            createMockField({
              semantic_type: "type/CreationTimestamp",
              name: "CREATED_AT",
              effective_type: "type/DateTime",
              id: 13,
              display_name: "Created At: Month",
              base_type: "type/DateTime",
            }),
            createMockField({
              display_name: "Count",
              semantic_type: "type/Quantity",
              base_type: "type/BigInteger",
              effective_type: "type/BigInteger",
              name: "count",
            }),
          ],
        }),
      ),
    ).toEqual({
      state: {
        display: "line",
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CREATED_AT",
              sourceId: "card:1",
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: "card:1",
            },
          ],
        },
        columns: [
          {
            base_type: "type/DateTime",
            display_name: "Created At: Month",
            effective_type: "type/DateTime",
            field_ref: [
              "field",
              "COLUMN_1",
              {
                "base-type": "type/DateTime",
              },
            ],
            id: 13,
            name: "COLUMN_1",
            semantic_type: "type/CreationTimestamp",
          },
          {
            base_type: "type/BigInteger",
            display_name: "Count",
            effective_type: "type/BigInteger",
            field_ref: [
              "field",
              "COLUMN_2",
              {
                "base-type": "type/BigInteger",
              },
            ],
            name: "COLUMN_2",
            semantic_type: "type/Quantity",
          },
        ],
        settings: {
          column_settings: {
            '["name","count"]': {
              currency_style: "code",
              number_style: "currency",
            },
          },
          "graph.dimensions": ["COLUMN_1"],
          "graph.label_value_frequency": "fit",
          "graph.metrics": ["COLUMN_2"],
          "graph.show_values": true,
        },
      },
      extraDataSources: ["card:1"],
    });
  });
});
