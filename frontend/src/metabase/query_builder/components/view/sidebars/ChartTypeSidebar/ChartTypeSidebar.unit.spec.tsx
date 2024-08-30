import userEvent from "@testing-library/user-event";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { ChartTypeSidebar } from "metabase/query_builder/components/view/sidebars/ChartTypeSidebar/ChartTypeSidebar";
import { getMetadata } from "metabase/selectors/metadata";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

registerVisualizations();

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
    <ChartTypeSidebar
      question={question}
      query={question.legacyQuery({ useStructuredQuery: true })}
      result={createMockDataset({ data: MOCK_DATASET_DATA })}
    />,
  );
};

describe("ChartSettingsSidebar", () => {
  it("should highlight the correct display type", () => {
    setup();

    //active display type
    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "Gauge",
    );
  });

  it("should call correct functions when display type is selected", async () => {
    const updateQuestion = jest.fn();
    const setUIControls = jest.fn();

    setup();

    await userEvent.click(screen.getByTestId("Progress-button"));

    expect(setUIControls).toHaveBeenCalledWith({ isShowingRawTable: false });
    expect(updateQuestion).toHaveBeenCalled();
  });

  it("should transition to settings page when clicking on the active display type", async () => {
    const onOpenChartSettings = jest.fn();

    setup();

    await userEvent.click(screen.getByTestId("Gauge-button"));

    expect(onOpenChartSettings).toHaveBeenCalledWith({
      initialChartSettings: { section: "Data" },
      showSidebarTitle: true,
    });
  });
});
