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

      expect(screen.getByText("Tables")).toBeInTheDocument();
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
});
