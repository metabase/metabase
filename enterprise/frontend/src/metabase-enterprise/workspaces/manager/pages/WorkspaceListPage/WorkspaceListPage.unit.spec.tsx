import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import { setupListWorkspacesEndpoint } from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import * as Urls from "metabase/urls";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { Workspace } from "metabase-types/api";
import { createMockWorkspace } from "metabase-types/api/mocks";

import { WorkspaceListPage } from "./WorkspaceListPage";

type SetupOpts = {
  workspaces?: Workspace[];
};

function setup({ workspaces = [] }: SetupOpts = {}) {
  setupListWorkspacesEndpoint(workspaces);
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  return renderWithProviders(
    <Route path={Urls.workspaceList()} component={WorkspaceListPage} />,
    {
      withRouter: true,
      initialRoute: Urls.workspaceList(),
    },
  );
}

function getList() {
  return screen.getByTestId("workspace-list");
}

describe("WorkspaceListPage", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("should render one row per workspace", async () => {
    setup({
      workspaces: [
        createMockWorkspace({ id: 1, name: "Acme analytics" }),
        createMockWorkspace({ id: 2, name: "Beta sandbox" }),
      ],
    });

    expect(await screen.findByText("Acme analytics")).toBeInTheDocument();
    expect(screen.getByText("Beta sandbox")).toBeInTheDocument();
    expect(within(getList()).getAllByRole("row")).toHaveLength(2);
  });

  it("should show the empty state when no workspaces exist", async () => {
    setup({ workspaces: [] });

    expect(await screen.findByText(/No workspaces yet/i)).toBeInTheDocument();
  });

  it("should filter workspaces by name after debouncing the search input", async () => {
    setup({
      workspaces: [
        createMockWorkspace({ id: 1, name: "Acme analytics" }),
        createMockWorkspace({ id: 2, name: "Beta sandbox" }),
      ],
    });

    await screen.findByText("Acme analytics");

    await userEvent.type(screen.getByPlaceholderText("Search..."), "beta");

    await waitFor(
      () => {
        expect(
          within(getList()).queryByText("Acme analytics"),
        ).not.toBeInTheDocument();
      },
      { timeout: SEARCH_DEBOUNCE_DURATION + 1000 },
    );
    expect(within(getList()).getByText("Beta sandbox")).toBeInTheDocument();
  });

  it("should show a filtered-empty-state distinct from the unfiltered one when nothing matches", async () => {
    setup({
      workspaces: [createMockWorkspace({ id: 1, name: "Acme analytics" })],
    });

    await screen.findByText("Acme analytics");

    await userEvent.type(screen.getByPlaceholderText("Search..."), "zzz");

    expect(await screen.findByText(/No workspaces found/i)).toBeInTheDocument();
  });

  it("should open the create modal when New is clicked", async () => {
    setup({
      workspaces: [createMockWorkspace({ id: 1, name: "Acme analytics" })],
    });

    await screen.findByText("Acme analytics");

    await userEvent.click(screen.getByRole("button", { name: /New/i }));

    expect(
      await screen.findByRole("dialog", { name: /Create workspace/i }),
    ).toBeInTheDocument();
  });

  it("should navigate to the workspace page when a row is clicked", async () => {
    const { history } = setup({
      workspaces: [createMockWorkspace({ id: 42, name: "Acme analytics" })],
    });

    await userEvent.click(await screen.findByText("Acme analytics"));

    expect(history?.getCurrentLocation().pathname).toBe(Urls.workspace(42));
  });
});
