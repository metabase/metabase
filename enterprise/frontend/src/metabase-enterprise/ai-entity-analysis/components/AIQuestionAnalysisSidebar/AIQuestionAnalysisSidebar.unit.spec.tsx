import { screen, waitFor } from "@testing-library/react";

import { setupAnalyzeChartEndpoint } from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import type { AIEntityAnalysisResponse } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockQueryBuilderState } from "metabase-types/store/mocks";

import { AIQuestionAnalysisSidebar } from "./AIQuestionAnalysisSidebar";

jest.mock("metabase/visualizations/lib/image-exports", () => ({
  getBase64ChartImage: () => Promise.resolve("test-base64"),
  getChartSelector: () => "#chart",
}));

describe("AIQuestionAnalysisSidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch trigger analysis when question changes", async () => {
    const question = new Question(createMockCard());
    const mockResponse: AIEntityAnalysisResponse = {
      summary: "Test analysis",
    };

    setupAnalyzeChartEndpoint(mockResponse);

    renderWithProviders(
      <AIQuestionAnalysisSidebar question={question} onClose={jest.fn()} />,
      {
        storeInitialState: {
          qb: createMockQueryBuilderState({
            queryStatus: "complete",
          }),
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Test analysis")).toBeInTheDocument();
    });

    const copyButton = await screen.findByLabelText("copy icon");
    expect(copyButton).toBeInTheDocument();
  });
});
