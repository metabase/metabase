import userEvent from "@testing-library/user-event";

import { setupListDataAppsEndpoint } from "__support__/server-mocks";
import { act, fireEvent, screen, waitFor } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { Api } from "metabase/api";
import { reinitialize } from "metabase/plugins";
import { defer } from "metabase/utils/promise";
import type { DataApp } from "metabase-types/api";
import { createMockDataApp } from "metabase-types/api/mocks";

import { setup } from "../components/tests/test-setup";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: () => true,
}));

jest.mock("metabase/embedding/embedding-iframe-sdk/analytics", () => ({
  debouncedReportAnalytics: jest.fn(),
}));

const setupDataApps = ({
  apps = [
    createMockDataApp({ slug: "boba-hq", name: "Boba HQ" }),
    createMockDataApp({ slug: "sales", name: "Sales" }),
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
    slug: "draft",
    name: "Draft app",
    enabled: false,
  });

  const outdatedApp = createMockDataApp({
    slug: "outdated",
    name: "Outdated app",
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

    expect(await screen.findByTitle("Data app preview")).toHaveAttribute(
      "src",
      `${window.location.origin}/mb/embed/apps/sales`,
    );
  });

  it("removes the preview container padding", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    await screen.findByTitle("Data app preview");
    const previewContainer = screen.getByTestId("iframe-embed-container");

    expect(previewContainer).toHaveStyle({ padding: "0rem" });
  });

  it("does not offer auth choices for data apps", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Done/ })).toBeEnabled(),
    );

    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Metabase account (SSO)" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("enable-embedding-card"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", {
        name: "Existing session (local testing only)",
      }),
    ).not.toBeInTheDocument();
  });

  it("opens on the code step without a way back to other embed experiences", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    expect(await screen.findByTestId("embed-code-snippet")).toHaveTextContent(
      '<metabase-data-app path="sales"></metabase-data-app>',
    );

    expect(
      screen.queryByText("Select your embed experience"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
  });

  // data apps does not support theme overrides,
  // as each data app already defines its SDK theme.
  it("omits the saved theme from data app snippets", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
      savedTheme: { preset: "dark" },
    });

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
    expect(screen.getByRole("button", { name: /Done/ })).toBeDisabled();
    expect(
      screen.getByText("Preview will appear when you enable modular embedding"),
    ).toBeInTheDocument();
  });

  // jsdom ignores `inert`, so these check for it instead of tabbing to the
  // button. Browsers skip inert elements for focus, selection and copying.
  it("does not let the admin copy the code from the keyboard before embedding is enabled", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
      modularEmbeddingEnabled: false,
      showModularEmbedTerms: true,
    });

    await waitForRequestsToSettle();

    expect(screen.getByTestId("embed-code-section")).toHaveAttribute("inert");
  });

  it("lets the admin copy the code from the keyboard once embedding is enabled", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Done/ })).toBeEnabled(),
    );

    expect(screen.getByTestId("embed-code-section")).not.toHaveAttribute(
      "inert",
    );
  });

  it("excludes draft and outdated apps and selects an available app", async () => {
    setupDataApps({
      apps: [
        draftApp,
        outdatedApp,
        createMockDataApp({ slug: "sales", name: "Sales" }),
      ],
    });

    await userEvent.click(screen.getByRole("radio", { name: /Data App/ }));

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

  it.each([
    { status: "a draft", resourceId: draftApp.slug },
    { status: "an outdated", resourceId: outdatedApp.slug },
    { status: "a removed", resourceId: "removed-app" },
  ])(
    "does not let the admin finish embedding $status app",
    async ({ resourceId }) => {
      setupDataApps({
        initialState: { resourceType: "data-app", resourceId },
        apps: [draftApp, outdatedApp],
      });

      await waitForRequestsToSettle();

      expect(screen.getByRole("button", { name: /Done/ })).toBeDisabled();
      expect(screen.queryByTitle("Data app preview")).not.toBeInTheDocument();
      expect(
        screen.getByText("This data app can't be previewed."),
      ).toBeInTheDocument();
    },
  );

  it("lets the admin switch away from data apps when the app list is empty", async () => {
    setupDataApps({ apps: [] });

    await userEvent.click(screen.getByRole("radio", { name: /Data App/ }));
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
      // done is disabled until the list of data apps loads
      expect(screen.getByRole("button", { name: /Done/ })).toBeDisabled();
      expect(screen.queryByTitle("Data app preview")).not.toBeInTheDocument();
    } finally {
      appsListRequest.resolve([
        createMockDataApp({ slug: "sales", name: "Sales" }),
      ]);
    }

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Done/ })).toBeEnabled(),
    );

    expect(screen.getByTitle("Data app preview")).toBeInTheDocument();
  });

  it("hides the loading indicator after app preview loads", async () => {
    setupDataApps();

    await userEvent.click(screen.getByRole("radio", { name: /Data App/ }));

    const preview = await screen.findByTitle("Data app preview");
    expect(screen.getByTestId("preview-loading-indicator")).toBeInTheDocument();

    fireEvent.load(preview);
    expect(
      screen.queryByTestId("preview-loading-indicator"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("textbox", { name: "Data app" }));
    await userEvent.click(await screen.findByRole("option", { name: "Sales" }));
    expect(screen.getByTestId("preview-loading-indicator")).toBeInTheDocument();

    fireEvent.load(screen.getByTitle("Data app preview"));
    expect(
      screen.queryByTestId("preview-loading-indicator"),
    ).not.toBeInTheDocument();
  });

  it("disables 'done' when the app is removed while the wizard is open", async () => {
    let apps = [createMockDataApp({ slug: "sales", name: "Sales" })];

    const { store } = setupDataApps({
      apps: () => apps,
      initialState: { resourceType: "data-app", resourceId: "sales" },
    });

    const doneButton = await screen.findByRole("button", { name: /Done/ });
    await waitFor(() => expect(doneButton).toBeEnabled());

    // admin can open `Embed` while a `Make draft` request is pending,
    // so the list of data apps can refresh while the wizard is open.
    apps = [];

    act(() => {
      store.dispatch(Api.util.resetApiState());
    });

    await waitFor(() => expect(doneButton).toBeDisabled());
  });

  it.each(["Data Apps", "Exploration", "Browser"])(
    "lets the admin switch to and from %s before accepting the usage conditions",
    async (experience) => {
      setupDataApps({
        modularEmbeddingEnabled: false,
        showModularEmbedTerms: true,
      });

      await waitForRequestsToSettle();

      const experienceRadio = screen.getByRole("radio", { name: experience });
      const dashboardRadio = screen.getByRole("radio", { name: /Dashboard/ });

      await userEvent.click(experienceRadio);
      expect(experienceRadio).toBeChecked();

      await userEvent.click(dashboardRadio);
      expect(dashboardRadio).toBeChecked();
    },
  );

  it("links to SSO setup when SSO is not configured", async () => {
    setupDataApps({
      initialState: { resourceType: "data-app", resourceId: "sales" },
      jwtReady: false,
    });

    await waitForRequestsToSettle();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Configure JWT SSO or SAML to embed a data app.",
    );

    const setupSsoLink = screen.getByRole("link", {
      name: "JWT SSO or SAML",
    });

    expect(setupSsoLink).toHaveAttribute("target", "_blank");
    expect(setupSsoLink).toHaveStyle({
      fontSize: "inherit",
      lineHeight: "inherit",
    });
  });
});
