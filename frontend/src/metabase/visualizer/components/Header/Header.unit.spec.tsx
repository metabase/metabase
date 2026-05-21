import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCardQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockVisualizerState } from "metabase/redux/store/mocks/visualizer";
import registerVisualizations from "metabase/visualizations/register";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDataset,
} from "metabase-types/api/mocks";

import { Header } from "./Header";

registerVisualizations();

const card1 = createMockCard({ id: 1, name: "Card one", display: "bar" });
const card2 = createMockCard({ id: 2, name: "Card two", display: "bar" });

type SetupOpts = {
  cards?: Card[];
  isDirty?: boolean;
  initialSourceCards?: Card[];
};

const setup = ({
  cards = [],
  isDirty = false,
  initialSourceCards,
}: SetupOpts = {}) => {
  cards.forEach((card) => {
    setupCardEndpoints(card);
    setupCardQueryEndpoints(card, createMockDataset());
    setupCardQueryMetadataEndpoint(card, createMockCardQueryMetadata());
  });

  const initialColumnValuesMapping = initialSourceCards
    ? Object.fromEntries(
        initialSourceCards.map((card) => [
          `col_${card.id}`,
          [
            {
              sourceId: `card:${card.id}`,
              originalName: "X",
              name: `col_${card.id}`,
            },
          ],
        ]),
      )
    : {};

  const display = cards.length > 0 ? "bar" : null;
  const initialDisplay =
    initialSourceCards && initialSourceCards.length > 0 ? "bar" : null;
  const present = createMockVisualizerState({
    display,
    cards: cards as any,
    initialState: {
      display: initialDisplay,
      columns: [],
      columnValuesMapping: initialColumnValuesMapping as any,
      settings: {},
    },
  });
  // getIsDirty compares past[0] to present using _.isEqual. To force isDirty,
  // give past a different snapshot than present.
  const past = isDirty
    ? [createMockVisualizerState({ display: null, cards: [] }) as any]
    : [];

  const state = createMockState({
    visualizer: { past, present, future: [] },
  });

  const onSave = jest.fn();
  const onClose = jest.fn();

  const utils = renderWithProviders(
    <Header onSave={onSave} onClose={onClose} />,
    { storeInitialState: state },
  );

  const dispatchSpy = jest.spyOn(utils.store, "dispatch");

  return { onSave, onClose, dispatchSpy };
};

const wasInitializeVisualizerDispatched = (dispatchSpy: jest.SpyInstance) =>
  dispatchSpy.mock.calls.some(([action]) => {
    if (action && typeof action === "object") {
      const type = (action as { type?: string }).type ?? "";
      return type.startsWith("visualizer/initializeVisualizer");
    }
    if (typeof action === "function") {
      const dispatched: Array<{ type?: string }> = [];
      const stubDispatch = (a: { type?: string }) => {
        dispatched.push(a);
        return a;
      };
      try {
        (action as (d: typeof stubDispatch, gs: () => unknown) => unknown)(
          stubDispatch,
          () => ({}),
        );
      } catch {
        // thunk may attempt to fetch; only the synchronous pending action matters
      }
      return dispatched.some((a) =>
        a.type?.startsWith("visualizer/initializeVisualizer"),
      );
    }
    return false;
  });

describe("Header reset button", () => {
  it("is disabled when the visualization is not dirty", () => {
    setup({ cards: [card1], isDirty: false });

    expect(screen.getByTestId("visualizer-reset-button")).toBeDisabled();
  });

  it("is disabled when there are no data sources", () => {
    setup({ cards: [] });

    expect(screen.getByTestId("visualizer-reset-button")).toBeDisabled();
  });

  it("is enabled when the visualization is dirty", () => {
    setup({ cards: [card1], isDirty: true });

    expect(screen.getByTestId("visualizer-reset-button")).toBeEnabled();
  });

  it("opens a confirm modal when clicked", async () => {
    setup({ cards: [card1, card2], isDirty: true });

    await userEvent.click(screen.getByTestId("visualizer-reset-button"));

    expect(await screen.findByText("Reset to defaults?")).toBeInTheDocument();
  });

  it("dispatches a reset when the modal is confirmed", async () => {
    const { dispatchSpy } = setup({ cards: [card1, card2], isDirty: true });

    await userEvent.click(screen.getByTestId("visualizer-reset-button"));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Reset" }),
    );

    expect(wasInitializeVisualizerDispatched(dispatchSpy)).toBe(true);
  });

  it("does not dispatch a reset when the modal is canceled", async () => {
    const { dispatchSpy } = setup({ cards: [card1, card2], isDirty: true });

    await userEvent.click(screen.getByTestId("visualizer-reset-button"));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    expect(wasInitializeVisualizerDispatched(dispatchSpy)).toBe(false);
  });

  it("removes data sources that aren't part of the initial state", async () => {
    const { dispatchSpy } = setup({
      cards: [card1, card2],
      isDirty: true,
      initialSourceCards: [card1],
    });

    await userEvent.click(screen.getByTestId("visualizer-reset-button"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Reset" }),
    );

    const removedSourceIds = dispatchSpy.mock.calls
      .map(([action]) => action)
      .filter(
        (
          action,
        ): action is { type: string; payload: { source: { id: string } } } =>
          typeof action === "object" &&
          action !== null &&
          (action as { type?: string }).type === "visualizer/removeDataSource",
      )
      .map((action) => action.payload.source.id);

    expect(removedSourceIds).toEqual(["card:2"]);
  });

  it("does not remove sources that are part of the initial state", async () => {
    const { dispatchSpy } = setup({
      cards: [card1],
      isDirty: true,
      initialSourceCards: [card1],
    });

    await userEvent.click(screen.getByTestId("visualizer-reset-button"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Reset" }),
    );

    const removeDataSourceCalls = dispatchSpy.mock.calls
      .map(([action]) => action)
      .filter(
        (action) =>
          typeof action === "object" &&
          action !== null &&
          (action as { type?: string }).type === "visualizer/removeDataSource",
      );

    expect(removeDataSourceCalls).toHaveLength(0);
  });
});
