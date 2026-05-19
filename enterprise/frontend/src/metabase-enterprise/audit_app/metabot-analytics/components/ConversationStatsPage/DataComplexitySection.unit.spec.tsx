import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import type { DataComplexityScoresResponse } from "../../types";

import { DataComplexitySection } from "./ConversationStatsPage";

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
