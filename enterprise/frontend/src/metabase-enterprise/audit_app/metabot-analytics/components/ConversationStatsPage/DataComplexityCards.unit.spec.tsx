import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import type {
  DataComplexityRating,
  DataComplexityScoresResponse,
} from "../../types";
import { DATA_COMPLEXITY_CATALOG_IDS } from "../../types";

import { DataComplexityCards } from "./DataComplexityCards";

const mockScore = (
  score: number,
  rating: DataComplexityRating = "low",
  rating_label = "Low complexity",
) => ({ rating, rating_label, score });

/* eslint-disable testing-library/no-node-access -- Snapshot cleanup is applied to a cloned DOM tree. */
const cleanForSnapshot = (element: Element) => {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll("style").forEach((style) => style.remove());
  [clone, ...Array.from(clone.querySelectorAll("*"))].forEach((node) => {
    node.removeAttribute("class");
    node.removeAttribute("style");
    node.removeAttribute("id");
    node.removeAttribute("aria-controls");
    node.removeAttribute("aria-describedby");
    node.removeAttribute("aria-labelledby");
  });

  return clone;
};
/* eslint-enable testing-library/no-node-access */

const mockComponentScore = (
  measurement: number,
  score: number,
  rating: DataComplexityRating = "low",
  rating_label = "Low complexity",
) => ({ measurement, rating, rating_label, score });

const mockScores: DataComplexityScoresResponse = {
  library: {
    ...mockScore(18),
    components: {
      size: {
        ...mockScore(18),
        components: {
          entity_count: mockComponentScore(1, 10),
          field_count: mockComponentScore(8, 8),
          collection_tree_size: mockComponentScore(2, 2),
          fields_per_entity: mockComponentScore(0.8, 1),
        },
      },
      ambiguity: {
        ...mockScore(3),
        components: {
          name_collisions: mockComponentScore(0, 0),
          synonym_pairs: mockComponentScore(0, 0),
          repeated_measures: mockComponentScore(0, 0),
          // nested sub-group: exercises arbitrary-depth rendering
          synonym_degree: {
            ...mockScore(3),
            components: {
              p50: mockComponentScore(1, 1),
              p90: mockComponentScore(2, 2),
              max: mockComponentScore(0, 0),
            },
          },
        },
      },
      // descriptive-only group with fractional (coverage-gap) measurements
      metadata: {
        ...mockScore(15),
        components: {
          description_coverage: mockComponentScore(0.75, 7.5),
          semantic_type_coverage: mockComponentScore(0.5, 5),
        },
      },
    },
  },
  universe: {
    ...mockScore(54),
    components: {
      size: {
        ...mockScore(44),
        components: {
          entity_count: mockComponentScore(2, 20),
          field_count: mockComponentScore(24, 24),
        },
      },
      ambiguity: {
        ...mockScore(10),
        components: {
          name_collisions: mockComponentScore(0, 0),
          synonym_pairs: mockComponentScore(0, 0),
          repeated_measures: mockComponentScore(5, 10),
        },
      },
    },
  },
  metabot: {
    ...mockScore(30),
    components: {
      size: {
        ...mockScore(30),
        components: {
          entity_count: mockComponentScore(1, 10),
          field_count: mockComponentScore(20, 20),
        },
      },
      ambiguity: {
        ...mockScore(0),
        components: {
          name_collisions: mockComponentScore(0, 0),
          synonym_pairs: mockComponentScore(0, 0),
          repeated_measures: mockComponentScore(0, 0),
        },
      },
    },
  },
  meta: {
    formula_version: 3,
    format_version: 1,
    synonym_threshold: 0.9,
  },
};

const mockScoresWithError: DataComplexityScoresResponse = {
  ...mockScores,
  metabot: {
    score: null,
    rating: null,
    rating_label: null,
    components: {
      ...mockScores.metabot.components,
      ambiguity: {
        score: null,
        rating: null,
        rating_label: null,
        components: {
          name_collisions: mockComponentScore(0, 0),
          synonym_pairs: {
            error: "Embedding service timed out",
          },
          repeated_measures: mockComponentScore(0, 0),
        },
      },
    },
  },
};

function renderDataComplexityCards(
  tokenFeatures: Partial<TokenFeatures> = { "data-complexity-score": true },
) {
  return renderWithProviders(<DataComplexityCards />, {
    storeInitialState: {
      settings: mockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
    },
  });
}

describe("DataComplexityCards", () => {
  it("does not fetch scores without a Data Complexity Score entitlement", () => {
    renderDataComplexityCards({});

    expect(
      screen.queryByText("Curated semantic layer"),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/data-complexity-score/complexity",
      ),
    ).toBe(false);
  });

  it("renders the data complexity cards", async () => {
    fetchMock.get("path:/api/ee/data-complexity-score/complexity", mockScores);

    const { container } = renderDataComplexityCards();

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

    renderDataComplexityCards();

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

    renderDataComplexityCards();

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

  it("shows a disabled state (not an error) when scoring is skipped at level 0", async () => {
    const emptyCatalog = { components: {} };
    fetchMock.get("path:/api/ee/data-complexity-score/complexity", {
      library: emptyCatalog,
      universe: emptyCatalog,
      metabot: emptyCatalog,
      meta: {
        formula_version: 2,
        format_version: 2,
        synonym_threshold: 0.8,
        level: 0,
      },
    });

    renderDataComplexityCards();

    expect(await screen.findAllByText("Scoring disabled")).toHaveLength(
      DATA_COMPLEXITY_CATALOG_IDS.length,
    );
    expect(screen.queryByText("Score unavailable")).not.toBeInTheDocument();
  });
});
