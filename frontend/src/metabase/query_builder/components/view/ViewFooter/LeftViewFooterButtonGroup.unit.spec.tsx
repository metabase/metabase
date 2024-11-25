import { screen } from "@testing-library/react";

import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type { Card, DashCardId, DashboardId } from "metabase-types/api";
import {
  createMockCard,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase-types/store/mocks";

import { LeftViewFooterButtonGroup } from "./LeftViewFooterButtonGroup";

const MOCK_QUERY = createMockStructuredDatasetQuery({
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
  },
});

type DashboardAwareCard = Card & {
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
};

function createMockMetadata(card?: Card) {
  const database = createSampleDatabase();
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      questions: card ? [card] : [],
    }),
  });
  return getMetadata(state);
}

function createMockSavedQuestion(card?: Partial<DashboardAwareCard>) {
  const savedCard = createMockCard({ dataset_query: MOCK_QUERY, ...card });
  return createMockMetadata(savedCard).question(savedCard.id) as Question;
}

const setup = ({
  isShowingChartSettingsSidebar = false,
  isShowingRawTable = false,
  isResultLoaded = true,
  isNotebook = false,
  hideChartSettings = false,
} = {}) => {
  const qbState = createMockQueryBuilderState({
    uiControls: createMockQueryBuilderUIControlsState({
      isShowingChartSettingsSidebar,
      isShowingRawTable,
    }),
  });

  const state = {
    ...createMockState(),
    qb: qbState,
  };

  const question = createMockSavedQuestion();

  return renderWithProviders(
    <LeftViewFooterButtonGroup
      question={question}
      isResultLoaded={isResultLoaded}
      isNotebook={isNotebook}
      hideChartSettings={hideChartSettings}
    />,
    { storeInitialState: state },
  );
};

describe("LeftViewFooterButtonGroup", () => {
  it("should show chart settings button when conditions are met", () => {
    setup();
    expect(screen.getByTestId("viz-settings-button")).toBeInTheDocument();
    expect(screen.getByText("Chart settings")).toBeInTheDocument();
  });

  it("should not show chart settings button in notebook mode", () => {
    setup({ isNotebook: true });
    expect(screen.queryByTestId("viz-settings-button")).not.toBeInTheDocument();
  });

  it("should not show chart settings button when hideChartSettings is true", () => {
    setup({ hideChartSettings: true });
    expect(screen.queryByTestId("viz-settings-button")).not.toBeInTheDocument();
  });

  it("should not show chart settings button when showing raw table", () => {
    setup({ isShowingRawTable: true });
    expect(screen.queryByTestId("viz-settings-button")).not.toBeInTheDocument();
  });

  it("should not show chart settings button when results are not loaded", () => {
    setup({ isResultLoaded: false });
    expect(screen.queryByTestId("viz-settings-button")).not.toBeInTheDocument();
  });
});
