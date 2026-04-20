import { createElement } from "react";

import { render, screen } from "__support__/ui";
import type { MetabotUsageResponse } from "metabase-enterprise/api";

import type { MetabaseManagedAiPricing } from "../../useMetabaseManagedAiPricing";

import {
  MetabasePricingText,
  getMetabaseUsageCost,
} from "./MetabaseAIProviderSetup";

const PRICING: MetabaseManagedAiPricing = {
  price: "$3.00",
  unit: "1M",
  pricePerUnit: 3,
  unitCount: 1_000_000,
  freeUnits: null,
};

function createUsage(tokens: number, freeTokens: number): MetabotUsageResponse {
  return {
    tokens,
    "free-tokens": freeTokens,
    "updated-at": null,
  };
}

describe("getMetabaseUsageCost", () => {
  it.each([
    { tokens: 100, freeTokens: 100 },
    { tokens: 50, freeTokens: 100 },
  ])(
    "returns 0 when tokens ($tokens) are less than or equal to free tokens ($freeTokens)",
    ({ tokens, freeTokens }) => {
      expect(
        getMetabaseUsageCost(createUsage(tokens, freeTokens), PRICING),
      ).toBe(0);
    },
  );

  it("calculates cost only for tokens above the free allocation", () => {
    expect(
      getMetabaseUsageCost(createUsage(3_000_000, 1_000_000), PRICING),
    ).toBe(6);
  });
});

describe("MetabasePricingText", () => {
  it("shows the free-token pricing message when free units are available", () => {
    render(
      createElement(MetabasePricingText, {
        pricing: { ...PRICING, freeUnits: "1M" },
      }),
    );

    expect(
      screen.getByText(
        "You get 1M tokens for free. Price per token afterward - $3.00 per 1M tokens",
      ),
    ).toBeInTheDocument();
  });

  it("shows the standard pricing message when no free units are available", () => {
    render(
      createElement(MetabasePricingText, {
        pricing: { ...PRICING, freeUnits: null },
      }),
    );

    expect(
      screen.getByText("Price per token - $3.00 per 1M tokens"),
    ).toBeInTheDocument();
  });
});
