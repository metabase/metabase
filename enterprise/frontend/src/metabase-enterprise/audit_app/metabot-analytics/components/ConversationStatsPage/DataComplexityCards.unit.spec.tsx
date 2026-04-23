import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";

import type { DataComplexityScoresResponse } from "../../types";

import { DataComplexityCards } from "./DataComplexityCards";

const mockScores: DataComplexityScoresResponse = {
  library: {
    total: 18,
    components: {
      entity_count: { measurement: 1, score: 10 },
      name_collisions: { measurement: 0, score: 0 },
      synonym_pairs: { measurement: 0, score: 0 },
      field_count: { measurement: 8, score: 8 },
      repeated_measures: { measurement: 0, score: 0 },
    },
  },
  universe: {
    total: 54,
    components: {
      entity_count: { measurement: 2, score: 20 },
      name_collisions: { measurement: 0, score: 0 },
      synonym_pairs: { measurement: 0, score: 0 },
      field_count: { measurement: 24, score: 24 },
      repeated_measures: { measurement: 5, score: 10 },
    },
  },
  metabot: {
    total: 30,
    components: {
      entity_count: { measurement: 1, score: 10 },
      name_collisions: { measurement: 0, score: 0 },
      synonym_pairs: { measurement: 0, score: 0 },
      field_count: { measurement: 20, score: 20 },
      repeated_measures: { measurement: 0, score: 0 },
    },
  },
  meta: {
    formula_version: 3,
    synonym_threshold: 0.9,
  },
};

const mockScoresWithError: DataComplexityScoresResponse = {
  ...mockScores,
  metabot: {
    total: null,
    components: {
      ...mockScores.metabot.components,
      synonym_pairs: {
        measurement: null,
        score: null,
        error: "Embedding service timed out",
      },
    },
  },
};

describe("DataComplexityCards", () => {
  afterEach(() => {
    fetchMock.removeRoutes();
    fetchMock.callHistory.clear();
  });

  it("renders the data complexity cards", async () => {
    const user = userEvent.setup();

    fetchMock.get("path:/api/ee/data-complexity-score/complexity", mockScores);

    renderWithProviders(<DataComplexityCards />);

    expect(
      await screen.findByText("Curated semantic layer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Models and metrics from the curated Library subset."),
    ).toBeInTheDocument();
    expect(screen.getByText("Full semantic layer")).toBeInTheDocument();
    expect(
      screen.getByText("Library entities plus every active physical table."),
    ).toBeInTheDocument();
    expect(screen.getByText("Metabot-visible layer")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The subset the internal Metabot can surface with its current scope.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("54")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getAllByText("Lower is better")).toHaveLength(3);

    await user.click(screen.getByText("Curated semantic layer"));
    const modal = within(await screen.findByRole("dialog"));

    expect(await modal.findByText("Size")).toBeInTheDocument();
    expect(
      modal.getByText("How much surface area this layer exposes."),
    ).toBeInTheDocument();
    expect(modal.getByText("Ambiguity")).toBeInTheDocument();
    expect(
      modal.getByText(
        "Signals that similar or repeated names could make answers harder to trust.",
      ),
    ).toBeInTheDocument();
    expect(
      modal.getByText(
        "How many tables, models, and metrics are included in this layer.",
      ),
    ).toBeInTheDocument();
    expect(
      modal.getByText(
        "Exact duplicate names after normalization, which can make entities harder to distinguish.",
      ),
    ).toBeInTheDocument();
    expect(
      modal.getByText(
        "Pairs of entity names that are semantically similar enough to be treated as possible synonyms.",
      ),
    ).toBeInTheDocument();
    expect(
      modal.getByText(
        "Active physical-table fields exposed through this layer.",
      ),
    ).toBeInTheDocument();
    expect(
      modal.getByText("Duplicate measure names across included tables."),
    ).toBeInTheDocument();
    expect(modal.getByText("1 entity")).toBeInTheDocument();
    expect(modal.getByText("8 fields")).toBeInTheDocument();
    expect(modal.getByText("0 collisions")).toBeInTheDocument();
    expect(modal.getByText("0 repeated names")).toBeInTheDocument();
    expect(modal.getByText("Close")).toBeInTheDocument();
  });

  it("shows a fallback message when the complexity endpoint fails", async () => {
    fetchMock.get("path:/api/ee/data-complexity-score/complexity", 500);

    renderWithProviders(<DataComplexityCards />);

    expect(
      await screen.findByText("Data complexity scores"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Data complexity scores are unavailable right now."),
    ).toBeInTheDocument();
  });

  it("shows component errors inside the modal", async () => {
    const user = userEvent.setup();

    fetchMock.get(
      "path:/api/ee/data-complexity-score/complexity",
      mockScoresWithError,
    );

    renderWithProviders(<DataComplexityCards />);

    expect(
      await screen.findByText("Metabot-visible layer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Score unavailable")).toBeInTheDocument();

    await user.click(screen.getByText("Metabot-visible layer"));
    const modal = within(await screen.findByRole("dialog"));

    expect(
      await modal.findByText("Some component scores could not be computed."),
    ).toBeInTheDocument();
    expect(modal.getByText("Embedding service timed out")).toBeInTheDocument();
  });
});
