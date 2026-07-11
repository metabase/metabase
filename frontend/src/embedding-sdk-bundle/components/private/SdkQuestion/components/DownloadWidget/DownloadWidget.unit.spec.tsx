import { renderWithProviders } from "__support__/ui";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { DownloadWidget } from "./DownloadWidget";

registerVisualizations();

// Stub the shared widget UI (we only care about what DownloadWidget hands to
// useDownloadData) and spy on useDownloadData to capture its arguments.
const useDownloadDataMock = jest.fn(() => [{}, jest.fn()] as const);
jest.mock("metabase/common/components/QuestionDownloadWidget", () => ({
  QuestionDownloadWidget: () => <div data-testid="download-widget-stub" />,
  useDownloadData: (params: unknown) => useDownloadDataMock(params),
}));

jest.mock("metabase/embedding/context", () => ({
  useEmbeddingEntityContext: () => ({ token: undefined }),
}));

const useSdkQuestionContextMock = jest.fn();
jest.mock("../../context", () => ({
  useSdkQuestionContext: () => useSdkQuestionContextMock(),
}));

// An ad-hoc pivot table: two dimensions + one aggregation. The default
// pivot_table.column_split partitions these into rows/columns/values.
const buildPivotSeries = () => {
  const card = createMockCard({ id: undefined as any, display: "pivot" });
  const data = createMockDatasetData({
    rows: [
      [10, "2024-01-01", 3],
      [20, "2024-02-01", 5],
    ],
    cols: [
      createMockColumn({
        name: "SUBTOTAL",
        display_name: "Subtotal",
        source: "breakout",
        base_type: "type/Float",
      }),
      createMockColumn({
        name: "CREATED_AT",
        display_name: "Created At",
        source: "breakout",
        base_type: "type/DateTime",
      }),
      createMockColumn({
        name: "count",
        display_name: "Count",
        source: "aggregation",
        base_type: "type/Integer",
      }),
    ],
  });

  const question = new Question(card, undefined);
  const result = createMockDataset({ data });

  return { question, result };
};

const setup = () => {
  const { question, result } = buildPivotSeries();

  useSdkQuestionContextMock.mockReturnValue({
    question,
    queryResults: [result],
    withDownloads: true,
    parameterValues: {},
  });

  renderWithProviders(<DownloadWidget />);
};

describe("DownloadWidget (SDK) - pivot visualization settings (metabase#70757)", () => {
  beforeEach(() => {
    useDownloadDataMock.mockClear();
  });

  it("passes computed pivot visualization settings to the download request", () => {
    setup();

    expect(useDownloadDataMock).toHaveBeenCalledTimes(1);
    const passedParams = useDownloadDataMock.mock.calls[0][0] as {
      visualizationSettings?: Record<string, unknown>;
    };

    // Before the fix, DownloadWidget passed no visualizationSettings, so the
    // ad-hoc /api/dataset/csv request omitted pivot_table.column_split and the
    // backend returned a blank pivoted CSV.
    expect(passedParams.visualizationSettings).toBeDefined();
    expect(
      passedParams.visualizationSettings?.["pivot_table.column_split"],
    ).toBeDefined();
  });
});
