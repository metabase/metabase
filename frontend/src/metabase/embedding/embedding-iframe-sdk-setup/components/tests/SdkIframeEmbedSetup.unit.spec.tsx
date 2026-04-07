import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
  setupDatabasesEndpoints,
} from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockDatabase,
} from "metabase-types/api/mocks";

import { setup } from "./test-setup";

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
  beforeEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => true);
  });

  afterEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => false;
  });

  it("navigates forward through the embed flow", async () => {
    setup({ simpleEmbeddingEnabled: true });

    expect(screen.getByText("Authentication")).toBeInTheDocument();

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
      screen.getByRole("button", { name: "Get code" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Get code" }));

    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Get code" }),
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
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
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

  it("disables next and back buttons when simple embedding is disabled", () => {
    setup({ simpleEmbeddingEnabled: false });

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  it("does not allow to go back when resourceType: question is the initial state", async () => {
    const mockDatabase = createMockDatabase();
    const mockCard = createMockCard({ id: 456 });

    setupDatabasesEndpoints([mockDatabase]);
    setupCardEndpoints(mockCard);
    setupCardQueryMetadataEndpoint(
      mockCard,
      createMockCardQueryMetadata({
        databases: [mockDatabase],
      }),
    );

    setup({
      simpleEmbeddingEnabled: true,
      initialState: {
        resourceType: "question",
        resourceId: 456,
      },
    });

    // Starts at the "select embed options" step.
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });
});

describe("Embed flow > Pro feature upsell indicators", () => {
  it("disables Pro checkboxes for OSS users (question)", () => {
    const mockDatabase = createMockDatabase();
    const mockCard = createMockCard({ id: 456 });

    setupDatabasesEndpoints([mockDatabase]);
    setupCardEndpoints(mockCard);
    setupCardQueryMetadataEndpoint(
      mockCard,
      createMockCardQueryMetadata({
        databases: [mockDatabase],
      }),
    );

    setup({
      simpleEmbeddingEnabled: false,
      initialState: {
        resourceType: "question",
        resourceId: 456,
      },
    });

    // All Pro-gated checkboxes should be disabled
    expect(
      screen.getByRole("checkbox", {
        name: "Allow people to drill through on data points",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Allow downloads" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Allow people to save new questions",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Allow alerts" }),
    ).toBeDisabled();
  });

  it("enables Pro checkboxes for Pro users (question)", async () => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => true);

    const mockDatabase = createMockDatabase();
    const mockCard = createMockCard({ id: 456 });

    setupDatabasesEndpoints([mockDatabase]);
    setupCardEndpoints(mockCard);
    setupCardQueryMetadataEndpoint(
      mockCard,
      createMockCardQueryMetadata({
        databases: [mockDatabase],
      }),
    );

    setup({
      simpleEmbeddingEnabled: true,
      hasEmailSetup: true,
      initialState: {
        resourceType: "question",
        resourceId: 456,
      },
    });

    expect(
      screen.getByRole("checkbox", {
        name: "Allow people to drill through on data points",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", { name: "Allow downloads" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", {
        name: "Allow people to save new questions",
      }),
    ).toBeEnabled();
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Allow alerts" }),
      ).toBeEnabled();
    });

    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => false;
  });

  it("disables Pro checkboxes for OSS users (dashboard)", () => {
    setupDatabasesEndpoints([createMockDatabase()]);

    setup({
      simpleEmbeddingEnabled: false,
      initialState: {
        resourceType: "dashboard",
        resourceId: 1,
      },
    });

    expect(
      screen.getByRole("checkbox", {
        name: "Allow people to drill through on data points",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Allow downloads" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: "Allow subscriptions" }),
    ).toBeDisabled();
  });

  it("enables Pro checkboxes for Pro users (dashboard)", async () => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => true);

    setup({
      simpleEmbeddingEnabled: true,
      hasEmailSetup: true,
    });

    // Navigate to options step: Next (experience) → Next (resource)
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      screen.getByRole("checkbox", {
        name: "Allow people to drill through on data points",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("checkbox", { name: "Allow downloads" }),
    ).toBeEnabled();
    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", { name: "Allow subscriptions" }),
      ).toBeEnabled();
    });

    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => false;
  });
});
