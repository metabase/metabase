import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, within } from "__support__/ui";

import type { DataComplexityScoresResponse } from "../../types";

import { DataComplexityCards } from "./DataComplexityCards";

/* eslint-disable testing-library/no-node-access -- Snapshot cleanup is applied to a cloned DOM tree. */
const cleanForSnapshot = (element: Element) => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("style").forEach((style) => style.remove());
  [clone, ...Array.from(clone.querySelectorAll("*"))].forEach((node) => {
    node.removeAttribute("class");
    node.removeAttribute("style");
    node.removeAttribute("id");
    node.removeAttribute("aria-describedby");
    node.removeAttribute("aria-labelledby");
  });

  return clone;
};
/* eslint-enable testing-library/no-node-access */

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
  it("renders the data complexity cards", async () => {
    fetchMock.get("path:/api/ee/data-complexity-score/complexity", mockScores);

    const { container } = renderWithProviders(<DataComplexityCards />);

    expect(
      await screen.findByText("Curated semantic layer"),
    ).toBeInTheDocument();
    expect(cleanForSnapshot(container)).toMatchSnapshot();

    await userEvent.click(screen.getByText("Curated semantic layer"));
    const modal = await screen.findByRole("dialog");

    expect(cleanForSnapshot(modal)).toMatchSnapshot();
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
    fetchMock.get(
      "path:/api/ee/data-complexity-score/complexity",
      mockScoresWithError,
    );

    renderWithProviders(<DataComplexityCards />);

    expect(
      await screen.findByText("Metabot-visible layer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Score unavailable")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Metabot-visible layer"));
    const modal = within(await screen.findByRole("dialog"));

    expect(
      await modal.findByText("Some component scores could not be computed."),
    ).toBeInTheDocument();
    expect(modal.getByText("Embedding service timed out")).toBeInTheDocument();
  });
});
