import { screen, waitFor } from "@testing-library/react";

import {
  setupAnalyzeChartEndpoint,
  setupAnalyzeDashboardEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";
import type { AIEntityAnalysisResponse, Card } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
} from "metabase-types/api/mocks";
import { createMockDashboardState } from "metabase-types/store/mocks";

import { AIDashboardAnalysisSidebar } from "./AIDashboardAnalysisSidebar";

jest.mock("metabase/visualizations/lib/image-exports", () => ({
  getDashboardImage: () => Promise.resolve("test-base64"),
  getBase64ChartImage: () => Promise.resolve("test-base64"),
  getChartSelector: () => "#chart",
}));

describe("AIDashboardAnalysisSidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should fetch and display dashboard analysis", async () => {
    const dashboard = createMockDashboard();
    const mockResponse: AIEntityAnalysisResponse = {
      summary: "Test dashboard analysis",
    };

    setupAnalyzeDashboardEndpoint(mockResponse);

    const dashboardState = createMockDashboardState({
      loadingDashCards: {
        loadingStatus: "complete",
        loadingIds: [],
        startTime: null,
        endTime: null,
      },
    });

    renderWithProviders(
      <AIDashboardAnalysisSidebar dashboard={dashboard} onClose={jest.fn()} />,
      {
        storeInitialState: {
          dashboard: dashboardState,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Test dashboard analysis")).toBeInTheDocument();
    });
  });

  it("should show chart title and analysis when dashcardId is provided", async () => {
    const dashboard = createMockDashboard();
    const dashcardId = 1;
    const mockResponse: AIEntityAnalysisResponse = {
      summary: "Test chart analysis",
    };

    setupAnalyzeChartEndpoint(mockResponse);

    const mockCard: Card = createMockCard({
      name: "Test Chart",
      description: "Test Description",
    });

    const mockDashcard = createMockDashboardCard({
      id: dashcardId,
      dashboard_id: dashboard.id,
      card_id: mockCard.id,
      card: mockCard,
    });

    const dashboardState = createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: [dashcardId],
          tabs: [],
        },
      },
      dashcards: {
        [dashcardId]: mockDashcard,
      },
      loadingDashCards: {
        loadingStatus: "complete",
        loadingIds: [],
        startTime: null,
        endTime: null,
      },
    });

    renderWithProviders(
      <AIDashboardAnalysisSidebar
        dashboard={dashboard}
        dashcardId={dashcardId}
        onClose={jest.fn()}
      />,
      {
        storeInitialState: {
          dashboard: dashboardState,
        },
      },
    );

    expect(screen.getByText("Explain this chart")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Test chart analysis")).toBeInTheDocument();
    });
  });
});
