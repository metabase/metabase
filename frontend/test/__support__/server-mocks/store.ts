import fetchMock from "fetch-mock";
import { match } from "ts-pattern";

import { createMockCloudAddOns } from "metabase-types/api/mocks/add-ons";

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
