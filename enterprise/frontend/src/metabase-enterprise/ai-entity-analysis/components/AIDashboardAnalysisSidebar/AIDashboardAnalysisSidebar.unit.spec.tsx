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

  it("should reload analysis when dashcardId changes", async () => {
    const dashboard = createMockDashboard();
    const firstDashcardId = 1;
    const secondDashcardId = 2;

    const firstChartResponse: AIEntityAnalysisResponse = {
      summary: "First chart analysis",
    };

    const secondChartResponse: AIEntityAnalysisResponse = {
      summary: "Second chart analysis",
    };

    setupAnalyzeChartEndpoint(firstChartResponse);

    const firstMockCard = createMockCard({
      id: 10,
      name: "First Chart",
      description: "First Description",
    });

    const secondMockCard = createMockCard({
      id: 20,
      name: "Second Chart",
      description: "Second Description",
    });

    const firstMockDashcard = createMockDashboardCard({
      id: firstDashcardId,
      dashboard_id: dashboard.id,
      card_id: firstMockCard.id,
      card: firstMockCard,
    });

    const secondMockDashcard = createMockDashboardCard({
      id: secondDashcardId,
      dashboard_id: dashboard.id,
      card_id: secondMockCard.id,
      card: secondMockCard,
    });

    const dashboardState = createMockDashboardState({
      dashboardId: dashboard.id,
      dashboards: {
        [dashboard.id]: {
          ...dashboard,
          dashcards: [firstDashcardId, secondDashcardId],
          tabs: [],
        },
      },
      dashcards: {
        [firstDashcardId]: firstMockDashcard,
        [secondDashcardId]: secondMockDashcard,
      },
      loadingDashCards: {
        loadingStatus: "complete",
        loadingIds: [],
        startTime: null,
        endTime: null,
      },
    });

    const { rerender } = renderWithProviders(
      <AIDashboardAnalysisSidebar
        dashboard={dashboard}
        dashcardId={firstDashcardId}
        onClose={jest.fn()}
      />,
      {
        storeInitialState: {
          dashboard: dashboardState,
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("First chart analysis")).toBeInTheDocument();
    });

    setupAnalyzeChartEndpoint(secondChartResponse);

    rerender(
      <AIDashboardAnalysisSidebar
        dashboard={dashboard}
        dashcardId={secondDashcardId}
        onClose={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Second chart analysis")).toBeInTheDocument();
    });
  });
});
