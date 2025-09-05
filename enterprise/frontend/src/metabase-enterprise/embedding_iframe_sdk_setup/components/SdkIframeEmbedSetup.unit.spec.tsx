import userEvent from "@testing-library/user-event";

import {
  setupDashboardEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockDashboard } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SdkIframeEmbedSetup } from "./SdkIframeEmbedSetup";

const setup = (options?: { simpleEmbeddingEnabled?: boolean }) => {
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupDashboardEndpoints(createMockDashboard());

  renderWithProviders(<SdkIframeEmbedSetup />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({
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
    setup({ simpleEmbeddingEnabled: true });

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
    setup({ simpleEmbeddingEnabled: true });

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
    setup({ simpleEmbeddingEnabled: true });

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
