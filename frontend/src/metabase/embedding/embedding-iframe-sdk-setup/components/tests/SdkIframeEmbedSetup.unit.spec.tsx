import userEvent from "@testing-library/user-event";

import {
  setupCardEndpoints,
  setupCardQueryMetadataEndpoint,
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

describe("Embed flow > misconfigured Site URL (EMB-1747)", () => {
  beforeEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => true);
  });

  afterEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => false;
  });

  it("renders a Site URL mismatch error in the preview area when the configured Site URL origin doesn't match the current host", async () => {
    setup({
      simpleEmbeddingEnabled: true,
      siteUrl: "http://different-host.example:9999",
      initialState: {
        resourceType: "dashboard",
        resourceId: 1,
        isGuest: false,
        useExistingUserSession: true,
      },
    });

    expect(
      await screen.findByTestId("sdk-iframe-embed-site-url-mismatch-error"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/Site URL doesn't match the host/i),
    ).toBeInTheDocument();

    expect(
      screen.getByText("http://different-host.example:9999"),
    ).toBeInTheDocument();
  });

  it("does not render the Site URL mismatch error when origins match", async () => {
    setup({
      simpleEmbeddingEnabled: true,
      siteUrl: window.location.origin,
      initialState: {
        resourceType: "dashboard",
        resourceId: 1,
        isGuest: false,
        useExistingUserSession: true,
      },
    });

    await waitFor(() => {
      expect(
        screen.getByTestId("sdk-iframe-embed-setup-modal-content"),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("sdk-iframe-embed-site-url-mismatch-error"),
    ).not.toBeInTheDocument();
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

    // The resource picker is part of the first step
    expect(screen.getByText("Select a dashboard to embed")).toBeInTheDocument();
    expect(
      screen.getByTestId("embed-browse-entity-button"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
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

    // First step (experience + resource) > select embed options
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();

    // Back to first step
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByText("Select your embed experience"),
    ).toBeInTheDocument();
    expect(screen.getByText("Select a dashboard to embed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  it("hides the resource picker for exploration on the first step", async () => {
    setup({ simpleEmbeddingEnabled: true });

    await userEvent.click(screen.getByRole("radio", { name: /Exploration/ }));

    // The resource picker is not shown for the exploration experience
    expect(
      screen.queryByText("Select a dashboard to embed"),
    ).not.toBeInTheDocument();

    // Clicking next goes directly to "select embed options"
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("hides the authentication and resource cards when Exploration is selected", async () => {
    setup({ simpleEmbeddingEnabled: true });

    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByText("Select a dashboard to embed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Exploration/ }));

    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Select a dashboard to embed"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Select initial collection"),
    ).not.toBeInTheDocument();
  });

  it("hides the authentication card but keeps the resource card (as a collection picker) when Browser is selected", async () => {
    setup({ simpleEmbeddingEnabled: true });

    expect(screen.getByText("Authentication")).toBeInTheDocument();
    expect(screen.getByText("Select a dashboard to embed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /Browser/ }));

    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Select a dashboard to embed"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change initial collection" }),
    ).toBeInTheDocument();
  });

  it("renders the SSO radio above the Guest radio in the authentication card", () => {
    setup({ simpleEmbeddingEnabled: true });

    const radios = screen.getAllByRole("radio");
    const ssoIndex = radios.findIndex((r) => r.getAttribute("value") === "sso");
    const guestIndex = radios.findIndex(
      (r) => r.getAttribute("value") === "guest-embed",
    );

    expect(ssoIndex).toBeGreaterThanOrEqual(0);
    expect(guestIndex).toBeGreaterThanOrEqual(0);
    expect(ssoIndex).toBeLessThan(guestIndex);
  });

  it("selects Guest when initialState.isGuest is true, even with SSO configured", () => {
    setup({
      simpleEmbeddingEnabled: true,
      jwtReady: true,
      initialState: { isGuest: true, useExistingUserSession: true },
    });

    expect(screen.getByDisplayValue("guest-embed")).toBeChecked();
    expect(screen.getByDisplayValue("sso")).not.toBeChecked();
  });

  describe("SSO not configured warnings", () => {
    const warningText =
      /This embed will only work for local testing\. To get production ready code, configure/;

    it("shows a warning on the authentication card when SSO is selected but not configured", () => {
      setup({ simpleEmbeddingEnabled: true, jwtReady: false });

      expect(screen.getByDisplayValue("sso")).toBeChecked();
      expect(screen.getByText("Authentication")).toBeInTheDocument();
      expect(screen.getByText(warningText)).toBeInTheDocument();
    });

    it("hides the warning when Guest is selected", async () => {
      setup({ simpleEmbeddingEnabled: true, jwtReady: false });

      await userEvent.click(screen.getByRole("radio", { name: "Guest" }));

      expect(screen.queryByText(warningText)).not.toBeInTheDocument();
    });

    it("hides the warning when SSO is configured", () => {
      setup({ simpleEmbeddingEnabled: true, jwtReady: true });

      expect(screen.queryByText(warningText)).not.toBeInTheDocument();
    });

    it.each(["Exploration", "Browser"])(
      "shows a warning on the experience card when %s is selected and SSO is not configured",
      async (experienceLabel) => {
        setup({ simpleEmbeddingEnabled: true, jwtReady: false });

        await userEvent.click(
          screen.getByRole("radio", { name: new RegExp(experienceLabel) }),
        );

        expect(screen.getByText(warningText)).toBeInTheDocument();
        // Authentication card is hidden so its warning is gone
        expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
      },
    );

    it("hides the experience card warning when Exploration is selected and SSO is configured", async () => {
      setup({ simpleEmbeddingEnabled: true, jwtReady: true });

      await userEvent.click(screen.getByRole("radio", { name: /Exploration/ }));

      expect(screen.queryByText(warningText)).not.toBeInTheDocument();
    });
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

    // Navigate to options step: Next (combined experience + resource step)
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

describe("Embed flow > Metabot", () => {
  beforeEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => true);
  });

  afterEach(() => {
    PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => false;
  });

  it("toggles the save option for Metabot", async () => {
    setup({
      simpleEmbeddingEnabled: true,
      metabotEnabled: true,
    });

    // Switch to Metabot experience
    await userEvent.click(screen.getByRole("radio", { name: /Metabot/ }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    const saveCheckbox = await screen.findByRole("checkbox", {
      name: "Allow people to save new questions",
    });

    expect(saveCheckbox).toBeEnabled();
    expect(saveCheckbox).not.toBeChecked();

    await userEvent.click(saveCheckbox);
    expect(saveCheckbox).toBeChecked();
  });
});
