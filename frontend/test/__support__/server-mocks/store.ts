import fetchMock from "fetch-mock";
import { match } from "ts-pattern";

import type { StoreTokenStatus } from "metabase-types/api";
import { createMockCloudAddOns } from "metabase-types/api/mocks/add-ons";

export function setupStoreTokenEndpoint(tokenStatus: StoreTokenStatus) {
  fetchMock.get("path:/api/premium-features/token/status", tokenStatus);
}

export function setupStoreEEBillingEndpoint(
  billing_period_months: number,
  simulate_http_get_error: boolean = false,
) {
  fetchMock.get("path:/api/ee/billing", {
    body: {
      version: "v1",
      data: { billing_period_months },
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
        // eslint-disable-next-line no-literal-metabase-strings -- Used for fetch mock only
        body: "Could not establish a connection to Metabase Cloud.",
        status: 404,
      }))
      .otherwise(() => ({
        status: 200,
      })),
  );
}
