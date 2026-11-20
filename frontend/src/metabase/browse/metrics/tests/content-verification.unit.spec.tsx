import "./content-verification-plugin";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupUpdateSettingEndpoint } from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { createMockCollection } from "metabase-types/api/mocks";

import { createMockMetricResult } from "../test-utils";
import type { MetricResult } from "../types";

import { type SetupOpts, setup as baseSetup } from "./setup";

const VERIFIED_SWITCH_NAME = /show.*verified.*metrics/i;

function createMetrics({ verified }: { verified: boolean }): MetricResult[] {
  const collection = createMockCollection({
    id: "root",
    name: "Our analytics",
  });
  return [
    createMockMetricResult({ id: 1, name: "Orders model metric", collection }),
    createMockMetricResult({
      id: 2,
      name: "Count of orders",
      collection,
      moderated_status: verified ? "verified" : null,
    }),
  ];
}

function setupVerification(opts: SetupOpts) {
  setupUpdateSettingEndpoint();
  baseSetup({
    tokenFeatures: { content_verification: true },
    enterprisePlugins: ["content_verification"],
    ...opts,
  });
}

function getSettingBodies() {
  return fetchMock.callHistory
    .calls("path:/api/setting/browse-filter-only-verified-metrics", {
      method: "PUT",
    })
    .map((call): unknown => JSON.parse(String(call.options.body)));
}

function getLastMetricsRequestParams() {
  const lastCall = fetchMock.callHistory
    .calls("path:/api/search")
    .map((call) => new URL(call.url).searchParams)
    .filter((params) => params.get("limit") !== "0")
    .at(-1);
  return lastCall;
}

describe("BrowseMetrics (EE with content verification)", () => {
  it("does not show the verified metrics filter when no metric is verified", async () => {
    setupVerification({
      metrics: createMetrics({ verified: false }),
      verifiedMetricsFilter: true,
    });

    expect(await screen.findByText("Orders model metric")).toBeInTheDocument();
    expect(screen.getByText("Count of orders")).toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: VERIFIED_SWITCH_NAME }),
    ).not.toBeInTheDocument();
    expect(getLastMetricsRequestParams()?.has("verified")).toBe(false);
  });

  it("shows only verified metrics when the filter setting is on, and every metric after turning it off", async () => {
    setupVerification({
      metrics: createMetrics({ verified: true }),
      verifiedMetricsFilter: true,
    });

    const verifiedSwitch = await screen.findByRole("switch", {
      name: VERIFIED_SWITCH_NAME,
    });
    expect(verifiedSwitch).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Count of orders")).toBeInTheDocument();
    expect(screen.queryByText("Orders model metric")).not.toBeInTheDocument();
    expect(getLastMetricsRequestParams()?.get("verified")).toBe("true");

    await userEvent.click(verifiedSwitch);

    await waitFor(() => expect(getSettingBodies()).toEqual([{ value: false }]));
    expect(await screen.findByText("Orders model metric")).toBeInTheDocument();
    expect(screen.getByText("Count of orders")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: VERIFIED_SWITCH_NAME }),
    ).toHaveAttribute("aria-selected", "false");
  });

  it("shows every metric when the filter setting is off, and only verified metrics after turning it on", async () => {
    setupVerification({
      metrics: createMetrics({ verified: true }),
      verifiedMetricsFilter: false,
    });

    const verifiedSwitch = await screen.findByRole("switch", {
      name: VERIFIED_SWITCH_NAME,
    });
    expect(verifiedSwitch).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByText("Orders model metric")).toBeInTheDocument();
    expect(screen.getByText("Count of orders")).toBeInTheDocument();

    await userEvent.click(verifiedSwitch);

    await waitFor(() => expect(getSettingBodies()).toEqual([{ value: true }]));
    await waitFor(() =>
      expect(screen.queryByText("Orders model metric")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Count of orders")).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: VERIFIED_SWITCH_NAME }),
    ).toHaveAttribute("aria-selected", "true");
    expect(getLastMetricsRequestParams()?.get("verified")).toBe("true");
  });
});
