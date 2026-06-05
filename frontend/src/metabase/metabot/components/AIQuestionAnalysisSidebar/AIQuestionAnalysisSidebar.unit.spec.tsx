import { screen, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { setupAnalyzeChartEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { createMockQueryBuilderState } from "metabase/redux/store/mocks";
import Question from "metabase-lib/v1/Question";
import type { AIEntityAnalysisResponse } from "metabase-types/api";
import {
  createMockCard,
  createMockTimeline,
  createMockTimelineEvent,
  createMockUser,
} from "metabase-types/api/mocks";

import { AIQuestionAnalysisSidebar } from "./AIQuestionAnalysisSidebar";

jest.mock("metabase/visualizations/lib/image-exports", () => ({
  getChartImagePngDataUri: () => Promise.resolve("test-base64"),
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
          settings: mockSettings({ "llm-metabot-configured?": true }),
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

  it("should send only visible timeline events with ones from the same collection", async () => {
    const collectionId = 42;

    const question = new Question(
      createMockCard({
        collection_id: collectionId,
      }),
    );

    const timelineEventSameCollection = createMockTimelineEvent({
      id: 1,
      name: "Release v1",
      description: "Released version 1",
      timestamp: "2024-05-12T00:00:00Z",
    });
    const invisibleTimelineEventSameCollection = createMockTimelineEvent({
      id: 2,
      name: "Beta Release v1",
      description: "Beta release",
      timestamp: "2024-04-12T00:00:00Z",
    });
    const visibleTimelineEventFromAnotherCollection = createMockTimelineEvent({
      id: 3,
      name: "Marketing Launch",
      description: "Rolled out our new website",
      timestamp: "2024-03-12T00:00:00Z",
    });

    const timelines = [
      createMockTimeline({
        collection_id: collectionId,
        events: [
          timelineEventSameCollection,
          invisibleTimelineEventSameCollection,
        ],
      }),
      createMockTimeline({
        // Different collection – should be ignored
        collection_id: collectionId + 1,
        events: [
          createMockTimelineEvent({
            id: 4,
            name: "Irrelevant event",
            description: "Should be filtered out",
            timestamp: "2024-05-13T00:00:00Z",
          }),
          visibleTimelineEventFromAnotherCollection,
        ],
      }),
    ];

    const visibleTimelineEvents = [
      timelineEventSameCollection,
      visibleTimelineEventFromAnotherCollection,
    ];

    const mockResponse: AIEntityAnalysisResponse = {
      summary: "Filtered analysis",
    };

    setupAnalyzeChartEndpoint(mockResponse);

    renderWithProviders(
      <AIQuestionAnalysisSidebar
        question={question}
        visibleTimelineEvents={visibleTimelineEvents}
        onClose={jest.fn()}
        timelines={timelines}
      />,
      {
        storeInitialState: {
          settings: mockSettings({ "llm-metabot-configured?": true }),
          qb: createMockQueryBuilderState({
            queryStatus: "complete",
          }),
        },
      },
    );

    await waitFor(() => {
      expect(screen.getByText("Filtered analysis")).toBeInTheDocument();
    });

    const lastCallRequest = fetchMock.callHistory.lastCall(
      "path:/api/ai-entity-analysis/analyze-chart",
    )?.request;
    const body = await lastCallRequest?.json();

    const analysisEventsFields = ["name", "description", "timestamp"];
    expect(body.timeline_events).toHaveLength(3);
    expect(body.timeline_events[0]).toMatchObject(
      _.pick(timelineEventSameCollection, analysisEventsFields),
    );
    expect(body.timeline_events[1]).toMatchObject(
      _.pick(invisibleTimelineEventSameCollection, analysisEventsFields),
    );
    expect(body.timeline_events[2]).toMatchObject(
      _.pick(visibleTimelineEventFromAnotherCollection, analysisEventsFields),
    );
  });

  it("should show a configuration notice instead of running analysis when AI is not configured", async () => {
    const question = new Question(createMockCard());

    renderWithProviders(
      <AIQuestionAnalysisSidebar question={question} onClose={jest.fn()} />,
      {
        storeInitialState: {
          currentUser: createMockUser({ is_superuser: true }),
          settings: mockSettings({ "llm-metabot-configured?": false }),
          qb: createMockQueryBuilderState({
            queryStatus: "complete",
          }),
        },
      },
    );

    expect(
      await screen.findByText("To use chart analysis, please", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "connect to a model" }),
    ).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called(
        "path:/api/ai-entity-analysis/analyze-chart",
      ),
    ).toBe(false);
  });
});
