import userEvent from "@testing-library/user-event";

import { setupListDataAppsEndpoint } from "__support__/server-mocks";
import { act, fireEvent, screen, waitFor } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { Api } from "metabase/api";
import { reinitialize } from "metabase/plugins";
import { defer } from "metabase/utils/promise";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { setup } from "./test-setup";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: () => true,
}));

jest.mock("metabase/embedding/embedding-iframe-sdk/analytics", () => ({
  debouncedReportAnalytics: jest.fn(),
}));

const setupDataApps = ({
  apps = [
    createMockDataApp({ name: "boba-hq", display_name: "Boba HQ" }),
    createMockDataApp({ name: "sales", display_name: "Sales" }),
  ],
  ...options
}: NonNullable<Parameters<typeof setup>[0]> & {
  apps?: Parameters<typeof setupListDataAppsEndpoint>[0];
} = {}) => {
  setupListDataAppsEndpoint(apps);

  return setup({
    modularEmbeddingEnabled: true,
    jwtReady: true,
    dataAppsEnabled: true,
    enterprisePlugins: ["embedding_iframe_sdk_setup", "data-apps"],
    ...options,
  });
};

describe("data app embedding setup", () => {
  const originalRoot = window.MetabaseRoot;

  const draftApp = createMockDataApp({
    name: "draft",
    display_name: "Draft app",
    enabled: false,
  });

  const outdatedApp = createMockDataApp({
    name: "outdated",
    display_name: "Outdated app",
    outdated: true,
  });

  afterEach(() => {
    window.MetabaseRoot = originalRoot;
    reinitialize();
  });

  it("previews under the current installation subpath", async () => {
    window.MetabaseRoot = "/mb/";
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Sales",
      ),
    );
    expect(screen.getByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/mb/embed/apps/sales`,
    );
  });

  it("does not offer auth choices for data apps", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Get code" })).toBeEnabled(),
    );

    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Metabase account (SSO)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("enable-embedding-card"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Get code" }));
    await screen.findByTestId("embed-code-snippet");

    expect(
      screen.queryByRole("radio", {
        name: "Existing session (local testing only)",
      }),
    ).not.toBeInTheDocument();
  });

  // data apps does not support theme overrides,
  // as each data app already defines its SDK theme.
  it("omits the saved theme from data app snippets", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
      savedTheme: { preset: "dark" },
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Sales",
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Get code" }));

    expect(
      await screen.findByTestId("embed-code-snippet"),
    ).not.toHaveTextContent('"theme"');
  });

  it("uses the selected data app in SSO code after switching from guest embedding", async () => {
    setupDataApps({ initialState: { isGuest: true } });

    await userEvent.click(screen.getByRole("radio", { name: /Data App/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Get code" })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sales" }));
    await userEvent.click(screen.getByRole("button", { name: "Get code" }));

    const snippet = await screen.findByTestId("embed-code-snippet");
    expect(snippet).toHaveTextContent(
      '<metabase-data-app path="sales"></metabase-data-app>',
    );

    // guest embeds are not supported in data apps - only SSO is supported
    expect(snippet).not.toHaveTextContent('"isGuest": true');
  });

  it("shows 'agree and enable' for data apps when embedding is disabled", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
      modularEmbeddingEnabled: false,
      showModularEmbedTerms: true,
    });

    await waitForRequestsToSettle();

    expect(
      screen.getByRole("button", { name: "Agree and enable" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();
  });

  it("excludes draft and outdated apps and replaces the selection with an available app", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: draftApp.name },
      apps: [
        draftApp,
        outdatedApp,
        createMockDataApp({ name: "sales", display_name: "Sales" }),
      ],
    });

    // if the selected app is a draft app, we replace the selection with an available app
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Sales",
      ),
    );

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    expect(screen.getByRole("option", { name: "Sales" })).toBeInTheDocument();

    // draft and outdated app must not be in the list of available apps
    expect(
      screen.queryByRole("option", { name: "Draft app" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Outdated app" }),
    ).not.toBeInTheDocument();
  });

  it("disables 'get code' when only draft and outdated apps are available", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "" },
      apps: [draftApp, outdatedApp],
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toBeEnabled(),
    );
    expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();
    expect(screen.queryByTitle("Data app preview")).not.toBeInTheDocument();

    // empty state is shown when there are no available apps to select from
    expect(screen.getByRole("img", { name: "No results" })).toBeInTheDocument();
    expect(
      screen.getByText("Preview will appear when you select what to embed"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    expect(await screen.findByText("No data apps found")).toBeInTheDocument();
  });

  it("hides the data app option without the data apps feature", async () => {
    setup();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Change dashboard" }),
      ).toHaveTextContent("Dashboard"),
    );

    expect(
      screen.queryByRole("radio", { name: /Data App/ }),
    ).not.toBeInTheDocument();
  });

  it("clears a missing app and allows switching experiences when the app list is empty", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "removed-app" },
      apps: [],
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toBeEnabled(),
    );

    expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue("");
    expect(screen.queryByTitle("Data app preview")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    expect(await screen.findByText("No data apps found")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /Dashboard/ }));
    expect(screen.getByRole("radio", { name: /Dashboard/ })).toBeChecked();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );
  });

  it("waits for the app list to load before previewing or generating code", async () => {
    const appsListRequest = defer<DataApp[]>();

    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
      apps: () => appsListRequest.promise,
    });

    try {
      // get code is disabled until the list of data apps loads
      expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();
      expect(screen.queryByTitle("Data app preview")).not.toBeInTheDocument();
    } finally {
      appsListRequest.resolve([
        createMockDataApp({ name: "sales", display_name: "Sales" }),
      ]);
    }

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Get code" })).toBeEnabled(),
    );

    expect(screen.getByTitle("Data app preview")).toBeInTheDocument();
  });

  it("hides the loading indicator after app preview loads", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    const preview = await screen.findByTitle("Data app preview");
    expect(screen.getByTestId("preview-loading-indicator")).toBeInTheDocument();

    fireEvent.load(preview);
    expect(
      screen.queryByTestId("preview-loading-indicator"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Boba HQ" }),
    );
    expect(screen.getByTestId("preview-loading-indicator")).toBeInTheDocument();

    fireEvent.load(screen.getByTitle("Data app preview"));
    expect(
      screen.queryByTestId("preview-loading-indicator"),
    ).not.toBeInTheDocument();
  });

  it("lets the admin go back to the data app picker after the selected app is removed", async () => {
    let apps = [createMockDataApp({ name: "sales", display_name: "Sales" })];

    const { store } = setupDataApps({
      apps: () => apps,
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Data app" })).toHaveValue(
        "Sales",
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Get code" }));
    const backButton = await screen.findByRole("button", { name: "Back" });
    const doneButton = screen.getByRole("button", { name: /Done/ });

    // admin can open `Embed` while a `Make draft` request is pending.
    // list of data apps then refreshes when the admins reaches the `Get code` step.
    apps = [];

    act(() => {
      store.dispatch(Api.util.resetApiState());
    });

    // the `Done` button will be disabled as there are no available apps to select
    await waitFor(() => expect(doneButton).toBeDisabled());
    expect(backButton).toBeEnabled();

    // data app list should be refreshed - should now be empty
    await userEvent.click(backButton);
    expect(
      await screen.findByRole("textbox", { name: "Data app" }),
    ).toHaveValue("");

    expect(screen.getByRole("button", { name: "Get code" })).toBeDisabled();
  });
});
