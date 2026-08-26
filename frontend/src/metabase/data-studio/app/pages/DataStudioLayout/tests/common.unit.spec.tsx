import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import * as Urls from "metabase/urls";

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

  describe("transforms nav tab", () => {
    it("shows Data transformation when setup is incomplete", async () => {
      setup({ transformsSetupComplete: false, transformsEnabled: false });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
    });

    it("hides Data transformation when setup is complete but transforms are disabled", async () => {
      setup({ transformsSetupComplete: true, transformsEnabled: false });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Data transformation"),
      ).not.toBeInTheDocument();
    });

    it("shows Data transformation when transforms are enabled", async () => {
      setup({ transformsSetupComplete: true, transformsEnabled: true });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.getByLabelText("Data transformation")).toBeInTheDocument();
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
    });
  });
  describe("settings tab", () => {
    it("shows Settings for admins after transform setup is complete", async () => {
      setup({ isAdmin: true, transformsSetupComplete: true });

      const tab = await screen.findByLabelText("Settings");
      expect(tab).toHaveAttribute("href", Urls.dataStudioSettings());
    });

    it("hides Settings before transform setup is complete", async () => {
      setup({ isAdmin: true, transformsSetupComplete: false });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
    });

    it("hides Settings for non-admins even after transform setup is complete", async () => {
      setup({
        isAdmin: false,
        canAccessTransforms: true,
        transformsSetupComplete: true,
        transformsEnabled: true,
      });

      expect(await screen.findByTestId("data-studio-nav")).toBeInTheDocument();
      expect(screen.queryByLabelText("Settings")).not.toBeInTheDocument();
    });
  });
});
