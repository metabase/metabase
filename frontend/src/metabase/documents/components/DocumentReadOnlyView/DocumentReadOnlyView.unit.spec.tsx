import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupMockIntersectionObserver } from "__support__/intersection-observer";
import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
  setupForbiddenCardEndpoints,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { api } from "metabase/api/client";
import { registerVisualizations } from "metabase/visualizations/register";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
  createMockDocumentContent,
} from "metabase-types/api/mocks";

import { DocumentReadOnlyView } from "./DocumentReadOnlyView";

const CONTENT = createMockDocumentContent({
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Highlights" }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: "Revenue grew this quarter." }],
    },
  ],
});

registerVisualizations();

const ORDERS_CARD = createMockCard({ id: 1, name: "Orders by month" });

const CONTENT_WITH_CARD = createMockDocumentContent({
  content: [
    {
      type: "resizeNode",
      content: [{ type: "cardEmbed", attrs: { id: ORDERS_CARD.id } }],
    },
  ],
});

const CARD_URL = `path:/api/card/${ORDERS_CARD.id}`;
const CARD_QUERY_URL = `path:/api/card/${ORDERS_CARD.id}/query`;

function getCallCount(url: string) {
  return fetchMock.callHistory.calls(url).length;
}

function getFlushSyncWarnings(consoleError: jest.SpyInstance) {
  return consoleError.mock.calls.filter(([message]) =>
    String(message).includes("flushSync"),
  );
}

describe("DocumentReadOnlyView", () => {
  // A browser reports a newly observed element's intersection right away, so
  // an embed that swaps its observed element re-triggers its own data loading
  setupMockIntersectionObserver({ intersectOnObserve: true });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the document's content without letting the user edit it", async () => {
    renderWithProviders(<DocumentReadOnlyView content={CONTENT} />);

    expect(
      await screen.findByRole("heading", { name: "Highlights" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Revenue grew this quarter.")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "false",
    );
  });

  it("renders a card embed's title without a document loaded in the editor state", async () => {
    setupCardEndpoints(ORDERS_CARD);
    setupCardQueryEndpoints(ORDERS_CARD, createMockDataset());
    setupCardQueryMetadataEndpoint(ORDERS_CARD, createMockCardQueryMetadata());

    const { store } = renderWithProviders(
      <DocumentReadOnlyView content={CONTENT_WITH_CARD} />,
    );

    expect(await screen.findByTestId("card-embed-title")).toHaveTextContent(
      ORDERS_CARD.name,
    );
    expect(store.getState().documents.currentDocument).toBeNull();
    expect(getCallCount(CARD_URL)).toBe(1);
    expect(getCallCount(CARD_QUERY_URL)).toBe(1);
  });

  it("renders a card embed without a flushSync warning", async () => {
    const consoleError = jest.spyOn(console, "error");
    setupCardEndpoints(ORDERS_CARD);
    setupCardQueryEndpoints(ORDERS_CARD, createMockDataset());
    setupCardQueryMetadataEndpoint(ORDERS_CARD, createMockCardQueryMetadata());

    renderWithProviders(<DocumentReadOnlyView content={CONTENT_WITH_CARD} />);

    expect(await screen.findByTestId("card-embed-title")).toHaveTextContent(
      ORDERS_CARD.name,
    );
    expect(getFlushSyncWarnings(consoleError)).toEqual([]);
    consoleError.mockRestore();
  });

  it("does not let the user resize cards or columns", async () => {
    setupCardEndpoints(ORDERS_CARD);
    setupCardQueryEndpoints(ORDERS_CARD, createMockDataset());
    setupCardQueryMetadataEndpoint(ORDERS_CARD, createMockCardQueryMetadata());

    renderWithProviders(
      <DocumentReadOnlyView
        content={createMockDocumentContent({
          content: [
            {
              type: "resizeNode",
              content: [
                {
                  type: "flexContainer",
                  content: [
                    { type: "cardEmbed", attrs: { id: ORDERS_CARD.id } },
                    { type: "cardEmbed", attrs: { id: ORDERS_CARD.id } },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByTestId("document-card-embed")).toHaveLength(2),
    );
    expect(
      screen.queryByTestId("resize-node-drag-handle"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("flex-container-drag-handle"),
    ).not.toBeInTheDocument();
  });

  it("offers only downloading in a card's menu", async () => {
    setupCardEndpoints(ORDERS_CARD);
    setupCardQueryEndpoints(ORDERS_CARD, createMockDataset());
    setupCardQueryMetadataEndpoint(ORDERS_CARD, createMockCardQueryMetadata());

    renderWithProviders(<DocumentReadOnlyView content={CONTENT_WITH_CARD} />);

    await userEvent.click(
      await screen.findByRole("img", { name: "ellipsis icon" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Download results" }),
    ).toBeEnabled();
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("shows new content when the content changes", async () => {
    const consoleError = jest.spyOn(console, "error");
    setupCardEndpoints(ORDERS_CARD);
    setupCardQueryEndpoints(ORDERS_CARD, createMockDataset());
    setupCardQueryMetadataEndpoint(ORDERS_CARD, createMockCardQueryMetadata());

    const { rerender } = renderWithProviders(
      <DocumentReadOnlyView content={CONTENT} />,
    );
    expect(
      await screen.findByRole("heading", { name: "Highlights" }),
    ).toBeInTheDocument();

    rerender(<DocumentReadOnlyView content={CONTENT_WITH_CARD} />);

    expect(await screen.findByTestId("card-embed-title")).toHaveTextContent(
      ORDERS_CARD.name,
    );
    expect(
      screen.queryByRole("heading", { name: "Highlights" }),
    ).not.toBeInTheDocument();
    expect(getFlushSyncWarnings(consoleError)).toEqual([]);
    consoleError.mockRestore();
  });

  it("requests a deleted card once and says it is gone", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    fetchMock.get(CARD_URL, 404);
    fetchMock.post(CARD_QUERY_URL, 404);

    renderWithProviders(<DocumentReadOnlyView content={CONTENT_WITH_CARD} />);

    expect(
      await screen.findByText("Couldn't find this chart."),
    ).toBeInTheDocument();
    await act(() => jest.runOnlyPendingTimersAsync());
    expect(screen.getByText("Couldn't find this chart.")).toBeInTheDocument();
    expect(getCallCount(CARD_URL)).toBe(1);
    expect(getCallCount(CARD_QUERY_URL)).toBe(1);
  });

  it("tells the user when they cannot see an embedded card", async () => {
    setupForbiddenCardEndpoints(ORDERS_CARD.id);
    const onForbidden = jest.fn<void, [string]>();
    api.on(403, onForbidden);

    renderWithProviders(<DocumentReadOnlyView content={CONTENT_WITH_CARD} />);

    expect(
      await screen.findByText(
        "Sorry, you don't have permission to see this card.",
      ),
    ).toBeInTheDocument();
    expect(getCallCount(CARD_URL)).toBe(1);
    expect(onForbidden).not.toHaveBeenCalledWith(`/api/card/${ORDERS_CARD.id}`);
    api.off(403, onForbidden);
  });

  it("tells the user when they cannot see an embedded card's data", async () => {
    setupCardEndpoints(ORDERS_CARD);
    setupCardQueryMetadataEndpoint(ORDERS_CARD, createMockCardQueryMetadata());
    fetchMock.post(CARD_QUERY_URL, {
      status: 403,
      body: { message: "You do not have permissions to run this query." },
    });

    renderWithProviders(<DocumentReadOnlyView content={CONTENT_WITH_CARD} />);

    expect(
      await screen.findByText(
        "Sorry, you don't have permission to see this card.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("card-embed-title")).toHaveTextContent(
      ORDERS_CARD.name,
    );
    expect(getCallCount(CARD_QUERY_URL)).toBe(1);
  });
});
