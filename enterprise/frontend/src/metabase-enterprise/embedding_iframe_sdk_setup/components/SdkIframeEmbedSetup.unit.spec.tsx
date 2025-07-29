import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupDashboardEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockDashboard } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SdkIframeEmbedSetup } from "./SdkIframeEmbedSetup";

const setup = (options?: {
  showSimpleEmbedTerms?: boolean;
  simpleEmbeddingEnabled?: boolean;
}) => {
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupDashboardEndpoints(createMockDashboard());
  setupUpdateSettingsEndpoint();
  setupUpdateSettingEndpoint();

  renderWithProviders(<SdkIframeEmbedSetup />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
        "show-simple-embed-terms": options?.showSimpleEmbedTerms ?? true,
        "enable-embedding-simple": options?.simpleEmbeddingEnabled ?? false,
      }),
    }),
  });
};

describe("Embed flow > initial setup", () => {
  it("shows the embed experience step as the first step", () => {
    setup();

    expect(
      screen.getByText("Select your embed experience"),
    ).toBeInTheDocument();
  });

  it("selects the dashboard experience by default", () => {
    setup();

    const dashboardRadio = screen.getByRole("radio", { name: /Dashboard/ });
    expect(dashboardRadio).toBeChecked();
  });
});

describe("Embed flow > forward and backward navigation", () => {
  it("navigates forward through the embed flow", async () => {
    setup();

    expect(
      screen.getByText("Select your embed experience"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Select a dashboard to embed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Get Code" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Get Code" }));
    expect(
      screen.getByText("Choose the authentication method for embedding:"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get Code" }),
    ).not.toBeInTheDocument();
  });

  it("navigates backward to the previous step", async () => {
    setup();

    // Select embed type > select resource > select embed options
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();

    // Back to select resource
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Select a dashboard to embed")).toBeInTheDocument();

    // Back to select embed type
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByText("Select your embed experience"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("skips the 'select resource' step for exploration", async () => {
    setup();

    await userEvent.click(screen.getByRole("radio", { name: /Exploration/ }));

    // Clicking next skips "select resource" and go directly to "select embed options"
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();

    expect(
      screen.queryByText("Select a dashboard to embed"),
    ).not.toBeInTheDocument();
  });
});

describe("Embed flow > usage terms card", () => {
  it("shows the simple embed terms card when show-simple-embed-terms is true", () => {
    setup({ showSimpleEmbedTerms: true, simpleEmbeddingEnabled: false });

    expect(screen.getByText("First, some legalese.")).toBeInTheDocument();
    expect(screen.getByText(/When using simple embedding/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("does not show the simple embed terms card when show-simple-embed-terms is false", () => {
    setup({ showSimpleEmbedTerms: false, simpleEmbeddingEnabled: false });

    expect(screen.queryByText("First, some legalese.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Got it" }),
    ).not.toBeInTheDocument();
  });

  it("shows the simple embed terms card even when simple embedding is already enabled", () => {
    setup({ showSimpleEmbedTerms: true, simpleEmbeddingEnabled: true });

    // The card should still be shown if show-simple-embed-terms is true
    expect(screen.getByText("First, some legalese.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("handles accepting the terms by making PUT request to update settings", async () => {
    setup({ showSimpleEmbedTerms: true, simpleEmbeddingEnabled: true });

    const gotItButton = screen.getByRole("button", { name: "Got it" });
    await userEvent.click(gotItButton);

    // Verify that show-simple-embed-terms is set to false
    const matchingRequest = await waitForUpdateSetting(
      "show-simple-embed-terms",
      false,
    );

    expect(matchingRequest).toBeDefined();
  });

  it("automatically enables simple embedding when entering the flow", async () => {
    setup({ showSimpleEmbedTerms: true, simpleEmbeddingEnabled: false });

    // Verify that enable-embedding-simple is set to true
    const matchingRequest = await waitForUpdateSetting(
      "enable-embedding-simple",
      true,
    );

    expect(matchingRequest).toBeDefined();
  });
});

async function waitForPutRequests() {
  return waitFor(async () => {
    const puts = await findRequests("PUT");
    expect(puts.length).toBeGreaterThan(0);
    return puts;
  });
}

async function waitForUpdateSetting(
  settingName: string,
  expectedValue?: unknown,
) {
  return waitForPutRequests().then((putRequests) => {
    const settingRequests = putRequests.filter((req) =>
      req.url.includes("/api/setting"),
    );

    const matchingRequest = settingRequests.find((req) => {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      return (
        settingName in body &&
        (expectedValue === undefined || body[settingName] === expectedValue)
      );
    });

    return matchingRequest;
  });
}
