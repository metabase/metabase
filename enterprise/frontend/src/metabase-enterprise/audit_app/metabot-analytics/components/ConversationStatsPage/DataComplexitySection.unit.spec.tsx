import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import type {
  DataComplexityRating,
  DataComplexityScoresResponse,
} from "../../types";

import { DataComplexitySection } from "./ConversationStatsPage";

const mockScore = (
  score: number,
  rating: DataComplexityRating = "low",
  rating_label = "Low complexity",
) => ({ rating, rating_label, score });

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

function renderDataComplexitySection(tokenFeatures: Partial<TokenFeatures>) {
  return renderWithProviders(<DataComplexitySection />, {
    storeInitialState: {
      settings: mockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
    },
  });
}

describe("DataComplexitySection", () => {
  it("does not render data complexity or fetch scores without a Data Complexity Score entitlement", () => {
    renderDataComplexitySection({});

    expect(screen.queryByText("Data complexity")).not.toBeInTheDocument();
    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/data-complexity-score/complexity",
      ),
    ).toBe(false);
  });

  it("renders data complexity with the Data Complexity Score entitlement", async () => {
    fetchMock.get("path:/api/ee/data-complexity-score/complexity", mockScores);

    renderDataComplexitySection({ "data-complexity-score": true });

    expect(screen.getByText("Data complexity")).toBeInTheDocument();
    expect(
      await screen.findByText("Curated semantic layer"),
    ).toBeInTheDocument();
  });
});
