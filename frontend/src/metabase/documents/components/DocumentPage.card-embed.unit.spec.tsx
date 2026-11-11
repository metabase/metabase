import userEvent from "@testing-library/user-event";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import {
  setupAdhocQueryMetadataEndpoint,
  setupBookmarksEndpoints,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupCommentEndpoints,
  setupDocumentEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { getTimelineCheckbox } from "__support__/timelines";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { Route } from "metabase/router";
import { captureClickModifierKeys } from "metabase/urls";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  Dataset,
  DocumentContent,
  TemporalUnit,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockDataset,
  createMockDatasetData,
  createMockDocument,
  createMockDocumentContent,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersIdDatasetColumn,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DocumentPage } from "./DocumentPage";

registerVisualizations();

const DOCUMENT_ID = 1;

const COUNT_COLUMN = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  semantic_type: "type/Quantity",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const createOrdersCountByCreatedAtCard = ({
  id,
  name,
  unit,
}: Pick<Card, "id" | "name"> & { unit: TemporalUnit }) =>
  createMockCard({
    id,
    name,
    display: "line",
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit }],
          },
        ],
      }),
    ),
  });

const createOrdersCountByCreatedAtDataset = (unit: TemporalUnit): Dataset =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [
        createOrdersCreatedAtDatasetColumn({
          source: "breakout",
          unit,
          field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": unit }],
        }),
        COUNT_COLUMN,
      ],
      rows: [
        ["2025-01-01T00:00:00Z", 10],
        ["2026-01-01T00:00:00Z", 20],
        ["2027-01-01T00:00:00Z", 30],
      ],
    }),
  });

const ORDERS_CARD = createMockCard({
  id: 1,
  name: "Orders",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [{ source: { type: "table", id: ORDERS_ID } }],
    }),
  ),
});

const ORDERS_DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [createOrdersIdDatasetColumn(), createOrdersTotalDatasetColumn()],
    rows: [[1, 100]],
  }),
});

const ORDERS_COUNT_CARD = createMockCard({
  id: 2,
  name: "Orders, Count",
  display: "table",
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
        },
      ],
    }),
  ),
});

const ORDERS_COUNT_DATASET = createMockDataset({
  data: createMockDatasetData({ cols: [COUNT_COLUMN], rows: [[18760]] }),
});

const ORDERS_BY_YEAR_CARD = createOrdersCountByCreatedAtCard({
  id: 3,
  name: "Orders, Count, Grouped by Created At (year)",
  unit: "year",
});

const ORDERS_BY_MONTH_CARD = createOrdersCountByCreatedAtCard({
  id: 4,
  name: "Orders by Created At (Month)",
  unit: "month",
});

const RC1 = createMockTimelineEvent({
  id: 11,
  timeline_id: 10,
  name: "RC1",
  timestamp: "2026-06-01T00:00:00Z",
});

const RELEASES = createMockTimeline({
  id: 10,
  name: "Releases",
  collection_id: null,
  events: [RC1],
});

interface CardWithDataset {
  card: Card;
  dataset: Dataset;
}

const TIMELINE_DOCUMENT_CARDS: CardWithDataset[] = [
  {
    card: ORDERS_BY_YEAR_CARD,
    dataset: createOrdersCountByCreatedAtDataset("year"),
  },
  { card: ORDERS_COUNT_CARD, dataset: ORDERS_COUNT_DATASET },
  {
    card: ORDERS_BY_MONTH_CARD,
    dataset: createOrdersCountByCreatedAtDataset("month"),
  },
];

const NAVIGATION_DOCUMENT_CARDS: CardWithDataset[] = [
  { card: ORDERS_CARD, dataset: ORDERS_DATASET },
  { card: ORDERS_COUNT_CARD, dataset: ORDERS_COUNT_DATASET },
];

const createCardEmbedBlocks = (
  card: Card,
  index: number,
): DocumentContent[] => [
  {
    type: "resizeNode",
    attrs: { height: 350, minHeight: 280, _id: `resize-${index}` },
    content: [
      {
        type: "cardEmbed",
        attrs: { id: card.id, name: null, _id: `card-${index}` },
      },
    ],
  },
  { type: "paragraph", attrs: { _id: `paragraph-${index}` } },
];

interface SetupOpts {
  cards: CardWithDataset[];
}

const setupDocumentPage = ({ cards }: SetupOpts) => {
  const metadata = createMockCardQueryMetadata({
    databases: [createSampleDatabase()],
  });

  setupBookmarksEndpoints([]);
  setupDocumentEndpoints(
    createMockDocument({
      id: DOCUMENT_ID,
      name: "Card embeds document",
      can_write: true,
      collection_id: null,
      document: createMockDocumentContent({
        content: cards.flatMap(({ card }, index) =>
          createCardEmbedBlocks(card, index),
        ),
      }),
    }),
  );
  cards.forEach(({ card, dataset }) => {
    setupCardEndpoints(card);
    setupCardQueryMetadataEndpoint(card, metadata);
    setupCardQueryEndpoints(card, dataset);
  });
  // draft cards (e.g. after changing the timeline visibility) load their metadata ad-hoc
  setupAdhocQueryMetadataEndpoint(metadata);
  setupCommentEndpoints([], {
    target_type: "document",
    target_id: DOCUMENT_ID,
  });
  setupTimelinesEndpoints([RELEASES]);
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
    ],
  });

  return renderWithProviders(
    <Route path="/document/:entityId" element={<DocumentPage />} />,
    { withRouter: true, initialRoute: `/document/${DOCUMENT_ID}` },
  );
};

const getDocumentCard = (name: string) => {
  const card = screen
    .getAllByTestId("document-card-embed")
    .find(
      (element) =>
        within(element).queryByTestId("card-embed-title")?.textContent === name,
    );
  if (!card) {
    throw new Error(`Could not find the "${name}" card embed`);
  }
  return card;
};

const findDocumentCard = (name: string) => waitFor(() => getDocumentCard(name));

const openCardMenu = async (name: string) => {
  await userEvent.click(
    within(getDocumentCard(name)).getByRole("button", { name: /ellipsis/ }),
  );
  return screen.findByRole("menu");
};

const closeCardMenu = async () => {
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
  );
};

// jsdom does no hit-testing, so ProseMirror can't tell which node a click
// landed on. Point it at the card so the click selects the node, as it does
// in a browser when clicking the top of a card. Each card gets its own click
// position, so that selecting cards one after another quickly isn't taken as
// a double click.
const selectDocumentCard = async (name: string) => {
  const card = getDocumentCard(name);
  const cardIndex = screen.getAllByTestId("document-card-embed").indexOf(card);
  const elementFromPoint = jest
    .spyOn(document, "elementFromPoint")
    .mockReturnValue(card);
  await userEvent.pointer({
    keys: "[MouseLeft]",
    target: card,
    coords: { clientX: cardIndex * 100, clientY: cardIndex * 100 },
  });
  elementFromPoint.mockRestore();
};

const getTimelineSidebar = () =>
  screen.getByTestId("document-timeline-sidebar");

const findTimelineEventChip = (cardName: string, eventName: string) =>
  within(getDocumentCard(cardName)).findByRole("button", { name: eventName });

const queryTimelineEventChip = (cardName: string, eventName: string) =>
  within(getDocumentCard(cardName)).queryByRole("button", { name: eventName });

describe("DocumentPage card embeds", () => {
  const { setAllIntersecting } = setupMockIntersectionObserver();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("timeline events on chart embeds", () => {
    const setupTimelineDocument = async () => {
      setupDocumentPage({ cards: TIMELINE_DOCUMENT_CARDS });
      await findDocumentCard(ORDERS_BY_MONTH_CARD.name);
      setAllIntersecting(true);

      expect(
        await within(getDocumentCard(ORDERS_BY_YEAR_CARD.name)).findByTestId(
          "chart-container",
        ),
      ).toBeInTheDocument();
      expect(
        await within(getDocumentCard(ORDERS_COUNT_CARD.name)).findByTestId(
          "table-root",
        ),
      ).toBeInTheDocument();
      expect(
        await within(getDocumentCard(ORDERS_BY_MONTH_CARD.name)).findByTestId(
          "chart-container",
        ),
      ).toBeInTheDocument();
    };

    const openEventsSidebar = async (cardName: string) => {
      const menu = await openCardMenu(cardName);
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: /Events/ }),
      );
      expect(
        await screen.findByTestId("document-timeline-sidebar"),
      ).toBeInTheDocument();
      return waitFor(() => getTimelineCheckbox(RELEASES.name));
    };

    it("shows the Events menu item only for timeseries charts", async () => {
      await setupTimelineDocument();

      const timeseriesMenu = await openCardMenu(ORDERS_BY_YEAR_CARD.name);
      expect(
        within(timeseriesMenu).getByRole("menuitem", { name: /Events/ }),
      ).toBeInTheDocument();
      await closeCardMenu();

      const nonTimeseriesMenu = await openCardMenu(ORDERS_COUNT_CARD.name);
      expect(
        within(nonTimeseriesMenu).getByRole("menuitem", {
          name: /Edit Visualization/,
        }),
      ).toBeInTheDocument();
      expect(
        within(nonTimeseriesMenu).queryByRole("menuitem", { name: /Events/ }),
      ).not.toBeInTheDocument();
    });

    it("shows a timeline on a chart once it is checked in the Events sidebar, and reopens the sidebar from the event chip", async () => {
      await setupTimelineDocument();
      expect(
        queryTimelineEventChip(ORDERS_BY_YEAR_CARD.name, RC1.name),
      ).not.toBeInTheDocument();

      const checkbox = await openEventsSidebar(ORDERS_BY_YEAR_CARD.name);
      expect(checkbox).not.toBeChecked();

      await userEvent.click(checkbox);
      expect(getTimelineCheckbox(RELEASES.name)).toBeChecked();
      expect(
        await findTimelineEventChip(ORDERS_BY_YEAR_CARD.name, RC1.name),
      ).toBeInTheDocument();

      await userEvent.click(
        within(getTimelineSidebar()).getByLabelText("Close"),
      );
      expect(
        screen.queryByTestId("document-timeline-sidebar"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        within(getDocumentCard(ORDERS_BY_YEAR_CARD.name)).getByTestId(
          "timeline-event-chip",
        ),
      );
      expect(
        await screen.findByTestId("document-timeline-sidebar"),
      ).toBeInTheDocument();
    });

    it("keeps a separate timeline selection for each chart", async () => {
      await setupTimelineDocument();

      await userEvent.click(await openEventsSidebar(ORDERS_BY_YEAR_CARD.name));
      expect(getTimelineCheckbox(RELEASES.name)).toBeChecked();
      expect(
        await findTimelineEventChip(ORDERS_BY_YEAR_CARD.name, RC1.name),
      ).toBeInTheDocument();

      await selectDocumentCard(ORDERS_BY_MONTH_CARD.name);
      await waitFor(() =>
        expect(getTimelineCheckbox(RELEASES.name)).not.toBeChecked(),
      );
      expect(
        queryTimelineEventChip(ORDERS_BY_MONTH_CARD.name, RC1.name),
      ).not.toBeInTheDocument();

      await selectDocumentCard(ORDERS_BY_YEAR_CARD.name);
      await waitFor(() =>
        expect(getTimelineCheckbox(RELEASES.name)).toBeChecked(),
      );

      await userEvent.click(getTimelineCheckbox(RELEASES.name));
      expect(getTimelineCheckbox(RELEASES.name)).not.toBeChecked();
      await waitFor(() =>
        expect(
          queryTimelineEventChip(ORDERS_BY_YEAR_CARD.name, RC1.name),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe("navigating from and deleting a card embed", () => {
    const setupNavigationDocument = async () => {
      // The app calls this at startup. Without it, a modifier key gets to
      // openUrl only through window.event, which some test runners do not set.
      captureClickModifierKeys();
      // the table grid is virtualized and renders no cells without a size
      mockGetBoundingClientRect({ width: 1000, height: 1000 });
      const { router } = setupDocumentPage({
        cards: NAVIGATION_DOCUMENT_CARDS,
      });
      await findDocumentCard(ORDERS_COUNT_CARD.name);
      setAllIntersecting(true);

      if (!router) {
        throw new Error("The document page renders with a router");
      }
      const onLocationChange = jest.fn();
      router.onLocationChange(onLocationChange);

      const anchorClick = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});

      return { router, onLocationChange, anchorClick };
    };

    const getClickedAnchors = (
      anchorClick: jest.SpyInstance<void, [], HTMLAnchorElement>,
    ) =>
      anchorClick.mock.contexts.map((anchor) => ({
        href: anchor.getAttribute("href"),
        rel: anchor.rel,
        target: anchor.target,
      }));

    it.each(["Meta", "Control"])(
      "opens the question in a new tab when %s-clicking the card title",
      async (modifierKey) => {
        const { router, onLocationChange, anchorClick } =
          await setupNavigationDocument();
        const user = userEvent.setup();

        await user.keyboard(`{${modifierKey}>}`);
        await user.click(
          within(getDocumentCard(ORDERS_CARD.name)).getByTestId(
            "card-embed-title",
          ),
        );
        await user.keyboard(`{/${modifierKey}}`);

        expect(getClickedAnchors(anchorClick)).toEqual([
          {
            href: expect.stringMatching(/\/question\//),
            rel: "noopener",
            target: "_blank",
          },
        ]);
        expect(onLocationChange).not.toHaveBeenCalled();
        expect(router.location.pathname).toBe(`/document/${DOCUMENT_ID}`);
      },
    );

    it.each(["Meta", "Control"])(
      "opens a drill-through in a new tab when %s-clicking a click action",
      async (modifierKey) => {
        const { router, onLocationChange, anchorClick } =
          await setupNavigationDocument();
        const user = userEvent.setup();

        const countCard = getDocumentCard(ORDERS_COUNT_CARD.name);
        await user.click(
          await within(countCard).findByRole("gridcell", { name: "18,760" }),
        );
        const clickActions = await screen.findByTestId("click-actions-view");

        await user.keyboard(`{${modifierKey}>}`);
        await user.click(within(clickActions).getByText("See these Orders"));
        await user.keyboard(`{/${modifierKey}}`);

        expect(getClickedAnchors(anchorClick)).toEqual([
          {
            href: expect.stringMatching(/\/question/),
            rel: "noopener",
            target: "_blank",
          },
        ]);
        expect(onLocationChange).not.toHaveBeenCalled();
        expect(router.location.pathname).toBe(`/document/${DOCUMENT_ID}`);
      },
    );

    it("deletes a selected card with Backspace", async () => {
      await setupNavigationDocument();
      expect(screen.getAllByTestId("document-card-embed")).toHaveLength(2);

      await selectDocumentCard(ORDERS_CARD.name);
      await userEvent.keyboard("{Backspace}");

      await waitFor(() =>
        expect(screen.getAllByTestId("document-card-embed")).toHaveLength(1),
      );
      expect(
        within(screen.getByTestId("document-card-embed")).getByTestId(
          "card-embed-title",
        ),
      ).toHaveTextContent(ORDERS_COUNT_CARD.name);
    });
  });
});
