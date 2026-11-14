import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import {
  setupForbiddenCardEndpoints,
  setupPublicDocumentCardQueryEndpoint,
  setupPublicDocumentEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDocument,
  createMockDocumentContent,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { PublicDocument } from "./PublicDocument";

registerVisualizations();

type TimelineEventProps = Pick<
  VisualizationProps,
  | "timelineEvents"
  | "onOpenTimelines"
  | "onSelectTimelineEvents"
  | "onDeselectTimelineEvents"
>;

const mockRenderedVisualizationProps: TimelineEventProps[] = [];

// Event chips need a real ECharts instance to be positioned, so this spec checks what the document hands the chart;
// the chip's read-only behavior is covered by TimelineEventChip's own spec
jest.mock("metabase/visualizations/components/Visualization", () => ({
  __esModule: true,
  default: (props: TimelineEventProps) => {
    mockRenderedVisualizationProps.push(props);
    return <div data-testid="visualization-stub" />;
  },
}));

const PUBLIC_UUID = "f7e6d5c4-b3a2-4190-8877-665544332211";
const CARD = createMockCard({ id: 42, name: "Orders", display: "line" });
const EVENT = createMockTimelineEvent({ id: 7, name: "RC1" });

const CARD_CONTENT = createMockDocumentContent({
  content: [
    {
      type: "resizeNode",
      attrs: { height: 400, minHeight: 280 },
      content: [
        {
          type: "cardEmbed",
          attrs: { id: CARD.id, name: null, _id: "1" },
        },
      ],
    },
  ],
});

interface SetupOpts {
  cardTimelineEvents: Record<number, TimelineEvent[]>;
}

const setup = ({ cardTimelineEvents }: SetupOpts) => {
  setupPublicDocumentEndpoints(
    PUBLIC_UUID,
    createMockDocument({
      id: 1,
      name: "Public Document",
      document: CARD_CONTENT,
      cards: { [CARD.id]: CARD },
      card_timeline_events: cardTimelineEvents,
    }),
  );
  setupPublicDocumentCardQueryEndpoint(
    PUBLIC_UUID,
    CARD.id,
    createMockDataset(),
  );
  setupForbiddenCardEndpoints(CARD.id);

  renderWithProviders(
    <Route path="/public/document/:uuid" element={<PublicDocument />} />,
    {
      mode: "public",
      withRouter: true,
      initialRoute: `/public/document/${PUBLIC_UUID}`,
    },
  );
};

const getLastVisualizationProps = () => mockRenderedVisualizationProps.at(-1);

describe("PublicDocument timeline events", () => {
  const { setAllIntersecting } = setupMockIntersectionObserver();

  beforeEach(() => {
    mockRenderedVisualizationProps.length = 0;
  });

  it("shows a chart the events the server returned for it, read-only", async () => {
    setup({ cardTimelineEvents: { [CARD.id]: [EVENT] } });

    await screen.findByTestId("card-embed-title");
    setAllIntersecting(true);
    await screen.findByTestId("visualization-stub");

    await waitFor(() =>
      expect(getLastVisualizationProps()?.timelineEvents).toEqual([EVENT]),
    );
    expect(getLastVisualizationProps()).toMatchObject({
      onOpenTimelines: undefined,
      onSelectTimelineEvents: undefined,
      onDeselectTimelineEvents: undefined,
    });
  });

  it("shows no events on a chart the server returned none for", async () => {
    setup({ cardTimelineEvents: {} });

    await screen.findByTestId("card-embed-title");
    setAllIntersecting(true);
    await screen.findByTestId("visualization-stub");

    expect(getLastVisualizationProps()?.timelineEvents).toEqual([]);
  });
});
