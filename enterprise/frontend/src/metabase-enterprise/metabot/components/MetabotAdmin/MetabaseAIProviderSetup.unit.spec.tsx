import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupMetabaseManagedAiEndpoints,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import type { MetabotUsageResponse } from "metabase-enterprise/api";
import type { TokenStatusFeature } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";

import type { MetabaseManagedAiPricing } from "../../useMetabaseManagedAiPricing";

import {
  MetabaseAIProviderSetup,
  MetabasePricingText,
  getMetabaseUsageCost,
} from "./MetabaseAIProviderSetup";

type MetabotUsageQuota = {
  tokens?: number | null;
  free_tokens?: number | null;
  is_locked?: boolean;
};

type SetupOptions = {
  isAdmin?: boolean;
  isConfigured?: boolean;
  hasManagedAi?: boolean;
  hasDeprecatedAi?: boolean;
  offerMetabaseManagedAi?: boolean;
  metabasePricePerUnit?: number;
  pauseAddOnsResponse?: boolean;
  metabotUsageQuota?: MetabotUsageQuota | null;
};

function setup({
  isAdmin = true,
  isConfigured = false,
  hasManagedAi = false,
  hasDeprecatedAi = false,
  offerMetabaseManagedAi = false,
  metabasePricePerUnit = 3.0,
  pauseAddOnsResponse = false,
  metabotUsageQuota = null,
}: SetupOptions = {}) {
  fetchMock.removeRoutes();
  fetchMock.clearHistory();

  const tokenFeatures: TokenStatusFeature[] = [];
  if (hasManagedAi) {
    tokenFeatures.push("metabase-ai-managed");
  }
  if (hasDeprecatedAi) {
    tokenFeatures.push("metabot-v3");
  }
  if (offerMetabaseManagedAi) {
    tokenFeatures.push("offer-metabase-ai-managed");
  }

  const sessionProperties = createMockSettings({
    "is-hosted?": true,
    "llm-metabot-configured?": isConfigured,
    "token-features": createMockTokenFeatures({
      hosting: true,
      "offer-metabase-ai-managed": offerMetabaseManagedAi,
      "metabase-ai-managed": hasManagedAi,
      "metabot-v3": hasDeprecatedAi,
    }),
    "token-status": createMockTokenStatus({
      features: tokenFeatures,
    }),
  });

  setupPropertiesEndpoints(sessionProperties);

  setupMetabaseManagedAiEndpoints({
    metabasePricePerUnit,
    metabotUsageQuota: metabotUsageQuota
      ? {
          tokens: metabotUsageQuota.tokens ?? null,
          free_tokens: metabotUsageQuota.free_tokens ?? null,
          is_locked: metabotUsageQuota.is_locked ?? false,
          updated_at: null,
        }
      : null,
  });

  if (pauseAddOnsResponse) {
    fetchMock.removeRoute("path:/api/ee/cloud-add-ons/addons");
    fetchMock.get(
      "path:/api/ee/cloud-add-ons/addons",
      () => new Promise(() => undefined),
    );
  }

  fetchMock.post(
    "path:/api/premium-features/token/refresh",
    () => sessionProperties["token-status"],
  );

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings(sessionProperties),
  });

  setupEnterpriseOnlyPlugin("metabot");

  return renderWithProviders(<MetabaseAIProviderSetup />, {
    storeInitialState,
  });
}

const PRICING: MetabaseManagedAiPricing = {
  price: "$3.00",
  unit: "1M",
  pricePerUnit: 3,
  unitCount: 1_000_000,
  freeUnits: null,
};

function createUsage(
  tokens: number | null,
  freeTokens: number | null,
): MetabotUsageResponse {
  return {
    tokens,
    free_tokens: freeTokens,
    updated_at: null,
    is_locked: false,
  };
}

describe("MetabaseAIProviderSetup", () => {
  afterEach(() => {
    reinitialize();
  });

  describe("disconnected state", () => {
    it("shows the Metabase AI service introduction with loaded pricing", async () => {
      setup();

      expect(
        await screen.findByText("About Metabase AI service"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/The simplest way to get started with AI in Metabase/),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("Price per token - $3.00 per 1M tokens"),
      ).toBeInTheDocument();
    });

    it("does not render pricing text while the add-ons request is in flight", () => {
      setup({ pauseAddOnsResponse: true });

      expect(screen.queryByText(/Price per token/i)).not.toBeInTheDocument();
      expect(screen.getByText("About Metabase AI service")).toBeInTheDocument();
    });

    it("shows the Terms of Service checkbox when no managed AI feature is enabled", async () => {
      setup();

      const checkbox = await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
      });
      expect(checkbox).not.toBeChecked();
      expect(
        screen.getByRole("link", { name: "Terms of Service" }),
      ).toHaveAttribute("href", "https://www.metabase.com/license/hosting");
    });

    it("toggles the Terms of Service checkbox when clicked", async () => {
      setup();

      const checkbox = await screen.findByRole("checkbox", {
        name: /I agree with the Metabase AI Service/i,
      });
      expect(checkbox).not.toBeChecked();

      await userEvent.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it("hides the Terms checkbox and shows the legacy pricing notice when migrating from tiered AI to managed AI", async () => {
      setup({
        hasDeprecatedAi: true,
        offerMetabaseManagedAi: true,
      });

      expect(
        await screen.findByText(
          "You're on legacy tiered AI pricing today. On your next billing cycle, you'll switch to metered AI pricing.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", {
          name: /I agree with the Metabase AI Service/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("hides the Terms checkbox when the user already has the managed AI provider feature", async () => {
      setup({ hasManagedAi: true });

      expect(
        await screen.findByText("About Metabase AI service"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", {
          name: /I agree with the Metabase AI Service/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("hides the Terms checkbox when the user has the deprecated AI provider without a migration offer", async () => {
      setup({
        hasDeprecatedAi: true,
        offerMetabaseManagedAi: false,
      });

      expect(
        await screen.findByText("About Metabase AI service"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", {
          name: /I agree with the Metabase AI Service/i,
        }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/legacy tiered AI/i)).not.toBeInTheDocument();
    });

    it("asks non-admin users to contact an admin instead of showing the Terms checkbox", async () => {
      setup({ isAdmin: false });

      expect(
        await screen.findByText(
          "Please ask an Admin user to enable this for you.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", {
          name: /I agree with the Metabase AI Service/i,
        }),
      ).not.toBeInTheDocument();
    });
  });

  describe("connected state with managed AI feature", () => {
    it("shows the locked state UI when the user has run out of tokens", async () => {
      setup({
        isConfigured: true,
        hasManagedAi: true,
        metabotUsageQuota: {
          tokens: 2_000_000,
          free_tokens: 0,
          is_locked: true,
        },
      });

      expect(
        await screen.findByText("You've run out of AI service tokens"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Current billing cycle"),
      ).not.toBeInTheDocument();
    });

    it("shows the free trial usage row when within the free-token allowance", async () => {
      setup({
        isConfigured: true,
        hasManagedAi: true,
        metabotUsageQuota: { tokens: 250_000, free_tokens: 1_000_000 },
      });

      expect(await screen.findByText("Included use")).toBeInTheDocument();
      expect(screen.getByText("Free trial tokens")).toBeInTheDocument();
      expect(screen.getByText("250,000 / 1,000,000")).toBeInTheDocument();
      expect(
        await screen.findByText("Price per token afterward"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Current billing cycle"),
      ).not.toBeInTheDocument();
    });

    it("shows the current billing cycle UI once free tokens are exhausted", async () => {
      setup({
        isConfigured: true,
        hasManagedAi: true,
        metabasePricePerUnit: 3.0,
        metabotUsageQuota: { tokens: 3_000_000, free_tokens: 1_000_000 },
      });

      expect(
        await screen.findByText("Current billing cycle"),
      ).toBeInTheDocument();
      expect(screen.getByText("Total tokens")).toBeInTheDocument();
      expect(screen.getByText("3,000,000")).toBeInTheDocument();
      expect(screen.getByText("Total cost")).toBeInTheDocument();
      // (3M - 1M) tokens at $3 per 1M tokens = $6.00
      expect(await screen.findByText("$6.00")).toBeInTheDocument();
      expect(screen.queryByText("Included use")).not.toBeInTheDocument();
    });

    it("refreshes the token status when the connected card mounts", async () => {
      setup({
        isConfigured: true,
        hasManagedAi: true,
        metabotUsageQuota: { tokens: 0, free_tokens: 0 },
      });

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            "path:/api/premium-features/token/refresh",
          ),
        ).toBe(true);
      });
    });
  });

  describe("connected state with deprecated AI provider", () => {
    it("shows the legacy tiered pricing notice when the user can still migrate", async () => {
      setup({
        isConfigured: true,
        hasDeprecatedAi: true,
        offerMetabaseManagedAi: true,
        metabotUsageQuota: { tokens: 1_000_000, free_tokens: 0 },
      });

      expect(
        await screen.findByText(
          /You're on legacy tiered AI pricing today\. On your next billing cycle/i,
        ),
      ).toBeInTheDocument();
      // The managed-feature usage rows should not appear without the
      // metabase-ai-managed feature.
      expect(screen.queryByText("Total tokens")).not.toBeInTheDocument();
      expect(
        screen.queryByText("You've run out of AI service tokens"),
      ).not.toBeInTheDocument();
    });
  });
});

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
    renderWithProviders(
      <MetabasePricingText pricing={{ ...PRICING, freeUnits: "1M" }} />,
    );

    expect(
      screen.getByText(
        "You get 1M tokens for free. Price per token afterward - $3.00 per 1M tokens",
      ),
    ).toBeInTheDocument();
  });

  it("shows the standard pricing message when no free units are available", () => {
    renderWithProviders(
      <MetabasePricingText pricing={{ ...PRICING, freeUnits: null }} />,
    );

    expect(
      screen.getByText("Price per token - $3.00 per 1M tokens"),
    ).toBeInTheDocument();
  });
});
