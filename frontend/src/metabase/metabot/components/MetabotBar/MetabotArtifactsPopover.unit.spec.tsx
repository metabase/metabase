import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { push } from "react-router-redux";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCollectionItemsEndpoint,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import registerVisualizations from "metabase/visualizations/register";
import {
  createMockCard,
  createMockCollectionItem,
  createMockDataset,
  createMockUser,
} from "metabase-types/api/mocks";

import { MetabotArtifactsPopover } from "./MetabotArtifactsPopover";
import { readArtifactDragData } from "./artifactDragData";

function createMockDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  const dt = {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return [...store.keys()];
    },
    setData: (type: string, value: string) => {
      store.set(type, value);
    },
    getData: (type: string) => store.get(type) ?? "",
    setDragImage: () => {},
  };
  return dt as unknown as DataTransfer;
}

registerVisualizations();

jest.mock("react-router-redux", () => ({
  ...jest.requireActual("react-router-redux"),
  push: jest.fn((url: string) => ({ type: "TEST_PUSH", payload: url })),
}));

const PERSONAL_COLLECTION_ID = 100;

const CARDS = [
  createMockCard({ id: 22, name: "Revenue by month" }),
  createMockCard({ id: 2, name: "Orders" }),
  createMockCard({ id: 9, name: "Active users" }),
  createMockCard({ id: 6, name: "Churn" }),
];

function setup({ items = CARDS }: { items?: typeof CARDS } = {}) {
  CARDS.forEach((card) => {
    setupCardEndpoints(card);
    setupCardQueryEndpoints(card, createMockDataset());
  });
  setupCollectionItemsEndpoint({
    collection: { id: PERSONAL_COLLECTION_ID },
    collectionItems: items.map((card) =>
      createMockCollectionItem({ id: card.id, name: card.name, model: "card" }),
    ),
  });
  return renderWithProviders(<MetabotArtifactsPopover />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({
        personal_collection_id: PERSONAL_COLLECTION_ID,
      }),
      entities: createMockEntitiesState({ questions: CARDS }),
    }),
  });
}

async function openPopover() {
  await userEvent.click(screen.getByTestId("metabot-artifacts-trigger"));
}

describe("MetabotArtifactsPopover", () => {
  beforeEach(() => {
    jest.mocked(push).mockClear();
  });

  it("opens the popover with the Artifacts title and the fetched cards", async () => {
    setup();
    await openPopover();

    expect(
      await screen.findByTestId("metabot-artifacts-title"),
    ).toHaveTextContent("Artifacts");
    for (const card of CARDS) {
      expect(await screen.findByText(card.name)).toBeInTheDocument();
    }
  });

  it("requests the personal collection filtered to ai_generated cards", async () => {
    setup();
    await openPopover();
    await screen.findByText("Revenue by month");

    const lastCall = fetchMock.callHistory.lastCall(
      `path:/api/collection/${PERSONAL_COLLECTION_ID}/items`,
    );
    const url = new URL(lastCall?.url ?? "", "http://localhost");
    expect(url.searchParams.get("ai_generated")).toBe("true");
    expect(url.searchParams.getAll("models")).toEqual(["card"]);
  });

  it("shows an empty state when there are no artifacts", async () => {
    setup({ items: [] });
    await openPopover();

    expect(await screen.findByText("No artifacts yet.")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-artifacts-list"),
    ).not.toBeInTheDocument();
  });

  it("defaults to the two-column grid and toggles to the single-column list", async () => {
    setup();
    await openPopover();
    await screen.findByText("Revenue by month");

    const grid = screen.getByTestId("metabot-artifacts-list");
    expect(grid).toHaveStyle({ gridTemplateColumns: "1fr 1fr" });

    await userEvent.click(screen.getByLabelText("List view"));
    expect(grid).toHaveStyle({ gridTemplateColumns: "1fr" });

    await userEvent.click(screen.getByLabelText("Grid view"));
    expect(grid).toHaveStyle({ gridTemplateColumns: "1fr 1fr" });
  });

  it("writes the artifact payload to the dataTransfer on drag start", async () => {
    setup();
    await openPopover();
    await screen.findByText("Revenue by month");

    const [firstTile] = screen.getAllByTestId("metabot-artifact-tile");
    const dataTransfer = createMockDataTransfer();
    fireEvent.dragStart(firstTile, { dataTransfer });

    expect(readArtifactDragData(dataTransfer)).toEqual({
      model: "card",
      id: 22,
    });
  });

  it("navigates to the question and closes the popover when a tile is clicked", async () => {
    setup();
    await openPopover();

    await userEvent.click(await screen.findByText("Revenue by month"));

    expect(push).toHaveBeenCalledWith("/question/22");
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-artifacts-list"),
      ).not.toBeInTheDocument();
    });
  });
});
