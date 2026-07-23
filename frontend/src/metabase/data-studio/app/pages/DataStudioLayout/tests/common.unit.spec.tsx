import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";

import { setup } from "./setup";

describe("DataStudioLayout", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sidebar rendering", () => {
    it("should render the sidebar with navigation tabs", async () => {
      setup({ remoteSyncBranch: "main" });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByText("Connected data")).toBeInTheDocument();
    });

    it("should render content area", async () => {
      setup({ remoteSyncBranch: null });

      await waitFor(() => {
        expect(screen.getByTestId("data-studio-nav")).toBeInTheDocument();
      });

      expect(screen.getByTestId("content")).toBeInTheDocument();
    });
  });

  describe("workspaces tab", () => {
    it("does not render the Workspaces tab on OSS", async () => {
      setup({ remoteSyncBranch: "main" });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.queryByLabelText("Workspaces")).not.toBeInTheDocument();
    });
  });

  describe("transforms nav tab", () => {
    // Jobs and Runs moved out of the sidebar into the transforms section header,
    // so the sidebar only ever shows the "Data transformation" nav tab.
    it("shows Data transformation but not Jobs or Runs when setup is incomplete", async () => {
      setup({ transformsSetupComplete: false, transformsEnabled: false });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
      expect(screen.queryByLabelText("Jobs")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Runs")).not.toBeInTheDocument();
    });

    it("hides Data transformation when setup is complete but transforms are disabled", async () => {
      setup({ transformsSetupComplete: true, transformsEnabled: false });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Data transformation"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Jobs")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Runs")).not.toBeInTheDocument();
    });

    it("shows Data transformation, and keeps Jobs and Runs out of the sidebar, when transforms are enabled", async () => {
      setup({ transformsSetupComplete: true, transformsEnabled: true });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
      expect(screen.queryByLabelText("Jobs")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Runs")).not.toBeInTheDocument();
    });

    it("shows Data transformation for non-admins when setup is incomplete", async () => {
      setup({
        isAdmin: false,
        transformsSetupComplete: false,
        transformsEnabled: false,
      });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
      expect(screen.queryByLabelText("Jobs")).not.toBeInTheDocument();
    });

    it("hides the transform nav tab for non-admins without access when setup is complete", async () => {
      setup({
        isAdmin: false,
        canAccessTransforms: false,
        transformsSetupComplete: true,
        transformsEnabled: true,
      });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Data transformation"),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Jobs")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Runs")).not.toBeInTheDocument();
    });

    it("shows Data transformation for non-admins with transform access when enabled", async () => {
      setup({
        isAdmin: false,
        canAccessTransforms: true,
        transformsSetupComplete: true,
        transformsEnabled: true,
      });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
      expect(screen.queryByLabelText("Jobs")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Runs")).not.toBeInTheDocument();
    });
  });

  describe("settings tab", () => {
    // Settings is no longer a sidebar tab in the reorganized Data Studio nav.
    it("does not render a Settings tab in the sidebar", async () => {
      setup({ isAdmin: true, transformsSetupComplete: true });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
    });
  });
});
