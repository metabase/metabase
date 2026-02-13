import fetchMock from "fetch-mock";
import { match } from "ts-pattern";

import { createMockCloudAddOns } from "metabase-types/api/mocks/add-ons";

export function setupBillingEndpoints({
  billingPeriodMonths = 12,
  hasBasicTransformsAddOn = true,
  hasAdvancedTransformsAddOn = true,
  transformsBasicPrice = 100,
  transformsAdvancedPrice = 250,
  trialDays,
}: {
  billingPeriodMonths?: number;
  hasBasicTransformsAddOn?: boolean;
  hasAdvancedTransformsAddOn?: boolean;
  transformsBasicPrice?: number;
  transformsAdvancedPrice?: number;
  trialDays?: number;
} = {}) {
  const cloudAddOns = [
    ...(hasBasicTransformsAddOn
      ? [
          {
            id: 1,
            name: "Transforms (basic)",
            short_name: "Transforms",
            description: null,
            active: true,
            self_service: true,
            deployment: "cloud",
            billing_period_months: billingPeriodMonths,
            default_base_fee: transformsBasicPrice,
            default_included_units: 0,
            default_prepaid_units: 0,
            default_price_per_unit: 0,
            default_total_units: 0,
            is_metered: false,
            product_type: "transforms-basic",
            token_features: [],
            trial_days: trialDays,
            product_tiers: [],
          },
        ]
      : []),
    ...(hasAdvancedTransformsAddOn
      ? [
          {
            id: 2,
            name: "Transforms (advanced)",
            short_name: "Transforms + Python",
            description: null,
            active: true,
            self_service: true,
            deployment: "cloud",
            billing_period_months: billingPeriodMonths,
            default_base_fee: transformsAdvancedPrice,
            default_included_units: 0,
            default_prepaid_units: 0,
            default_price_per_unit: 0,
            default_total_units: 0,
            is_metered: false,
            product_type: "transforms-advanced",
            token_features: [],
            trial_days: trialDays,
            product_tiers: [],
          },
        ]
      : []),
  ];

  fetchMock.get("path:/api/ee/cloud-add-ons/addons", cloudAddOns);
  fetchMock.get("path:/api/ee/billing", {
    version: "0",
    data: {
      billing_period_months: billingPeriodMonths,
      previous_add_ons: [],
    },
  });
}

export function setupStoreEEBillingEndpoint(
  billing_period_months: number,
  had_metabot: false | "trial" | "tiered" = false,
  simulate_http_get_error: boolean = false,
) {
  fetchMock.get("path:/api/ee/billing", {
    body: {
      version: "v1",
      data: {
        billing_period_months,
        previous_add_ons:
          had_metabot === "trial"
            ? [{ product_type: "metabase-ai", self_service: true }]
            : had_metabot === "tiered"
              ? [{ product_type: "metabase-ai-tiered", self_service: true }]
              : null,
      },
    },
    status: simulate_http_get_error ? 500 : 200,
  });
}

export function setupStoreEECloudAddOnsEndpoint(
  billing_period_months: number,
  simulate_http_get_error: boolean = false,
) {
  fetchMock.get("path:/api/ee/cloud-add-ons/addons", {
    body: createMockCloudAddOns({ billing_period_months }),
    status: simulate_http_get_error ? 500 : 200,
  });
}

export function setupStoreEETieredMetabotAI(
  simulate_http_post_error:
    | false
    | "error-no-quantity"
    | "error-no-connection" = false,
) {
  fetchMock.post(
    "path:/api/ee/cloud-add-ons/metabase-ai-tiered",
    match(simulate_http_post_error)
      .with("error-no-quantity", () => ({
        body: { errors: { quantity: "Purchase of add-on requires quantity." } },
        status: 403,
      }))
      .with("error-no-connection", () => ({
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- Used for fetch mock only
        body: "Could not establish a connection to Metabase Cloud.",
        status: 404,
      }))
      .otherwise(() => ({
        status: 200,
      })),
  );
}
