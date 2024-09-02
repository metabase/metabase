import { screen, within } from "@testing-library/react";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { ChartTypeSettings } from "metabase/query_builder/components/view/chart-type/ChartTypeSettings/ChartTypeSettings";
import { getMetadata } from "metabase/selectors/metadata";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

const MOCK_DATABASE = createSampleDatabase();
const MOCK_CARD = createMockCard({
  database_id: MOCK_DATABASE.id,
  display: "gauge",
});

const MOCK_DATASET_DATA = createMockDatasetData({
  rows: [[1]],
  cols: [
    createMockColumn({
      base_type: "type/Integer",
      name: "foo",
      display_name: "foo",
    }),
  ],
});

const setup = () => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [MOCK_DATABASE],
      questions: [MOCK_CARD],
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const question = checkNotNull(metadata.question(MOCK_CARD.id));

  renderWithProviders(
    <ChartTypeSettings
      question={question}
      query={question.legacyQuery({ useStructuredQuery: true })}
      result={createMockDataset({ data: MOCK_DATASET_DATA })}
    />,
  );
};

describe("ChartTypeSettings", () => {
  it("should group sensible and nonsensible options separately and in the correct order", () => {
    setup();

    const sensible = within(
      screen.getByTestId("display-options-sensible"),
    ).getAllByTestId(/container/i);
    const nonSensible = within(
      screen.getByTestId("display-options-not-sensible"),
    ).getAllByTestId(/container/i);

    const sensibleOrder = ["Table", "Number", "Gauge", "Progress", "Detail"];
    const nonSensibleOrder = [
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Trend",
      "Funnel",
      "Map",
      "Scatter",
      "Waterfall",
    ];

    expect(sensible).toHaveLength(sensibleOrder.length);
    expect(nonSensible).toHaveLength(nonSensibleOrder.length);

    sensible.forEach((node, index) => {
      expect(node).toHaveTextContent(sensibleOrder[index]);
    });

    nonSensible.forEach((node, index) => {
      expect(node).toHaveTextContent(nonSensibleOrder[index]);
    });
  });
});
