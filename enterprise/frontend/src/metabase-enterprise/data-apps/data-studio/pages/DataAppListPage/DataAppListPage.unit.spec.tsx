import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupListDataAppsEndpoint,
  setupUserAcknowledgementEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { DataAppListPage } from "./DataAppListPage";

const BUILD_DOCS_URL =
  "https://www.metabase.com/docs/latest/data-apps/build.html";
const INTRO_TITLE = "Apps built on your semantic layer";
const INTRO_DESCRIPTION =
  "Data apps are highly customizable applications built on top of your vetted metrics and data. Create a data app with your AI agent of choice and the Metabase CLI, then sync it with git, and choose which groups can open and use it.";

type SetupOpts = {
  apps: DataApp[];
  isBuildGuideDismissed?: boolean;
};

function setup({ apps, isBuildGuideDismissed = false }: SetupOpts) {
  setupListDataAppsEndpoint(apps);
  const { names } = setupUserAcknowledgementEndpoints({
    key: "data-apps-build-guide",
    value: isBuildGuideDismissed,
  });
  renderWithProviders(<DataAppListPage />, { withRouter: true });
  return { acknowledgementRequestNames: names };
}

describe("DataAppListPage", () => {
  beforeEach(() => {
    mockGetBoundingClientRect({ width: 1000, height: 1000 });
  });

  it("lists the apps with their address and status", async () => {
    setup({
      apps: [
        createMockDataApp({
          slug: "order-desk",
          name: "Order desk",
          enabled: true,
        }),
        createMockDataApp({
          id: 2,
          slug: "inventory",
          name: "Inventory",
          enabled: true,
          outdated: true,
        }),
      ],
    });

    expect(await screen.findByText("Order desk")).toBeInTheDocument();
    expect(screen.getByText("/apps/order-desk")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Live, outdated")).toBeInTheDocument();
  });

  it("explains how to create a data app when there are none", async () => {
    setup({ apps: [] });

    expect(
      await screen.findByRole("heading", { name: INTRO_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(INTRO_DESCRIPTION)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Learn how to build data apps" }),
    ).toHaveAttribute("href", BUILD_DOCS_URL);
  });

  it("shows the build guide above the apps", async () => {
    setup({ apps: [createMockDataApp()] });

    const guide = await screen.findByRole("region", { name: INTRO_TITLE });
    expect(guide).toHaveTextContent(INTRO_DESCRIPTION);
    expect(
      screen.getByRole("link", { name: "Learn how to build data apps" }),
    ).toHaveAttribute("href", BUILD_DOCS_URL);
  });

  it("hides the build guide for good once the user dismisses it", async () => {
    const { acknowledgementRequestNames } = setup({
      apps: [createMockDataApp()],
    });

    await userEvent.click(
      await screen.findByRole("button", { name: "Dismiss" }),
    );

    expect(
      screen.queryByRole("region", { name: INTRO_TITLE }),
    ).not.toBeInTheDocument();
    const call = fetchMock.callHistory.lastCall(
      acknowledgementRequestNames.put,
    );
    expect(call).toBeDefined();
    const body: unknown = JSON.parse(String(call?.options.body));
    expect(body).toEqual({ value: true });
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("does not show the build guide to a user who dismissed it", async () => {
    const { acknowledgementRequestNames } = setup({
      apps: [createMockDataApp()],
      isBuildGuideDismissed: true,
    });

    expect(await screen.findByText("Sales")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(acknowledgementRequestNames.get),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("region", { name: INTRO_TITLE }),
    ).not.toBeInTheDocument();
  });
});
