import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupDashboardEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { Route } from "metabase/router";
import type { SettingKey } from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { GeneralSettingsPage } from "./GeneralSettingsPage";

const generalSettings = {
  "site-name": "Metabased",
  "custom-homepage": true,
  "custom-homepage-dashboard": 4242,
  "dismissed-custom-dashboard-toast": false,
  "site-url": "https://mysite.biz",
  "admin-email": "help@mysite.biz",
  "anon-tracking-enabled": false,
  "analytics-pii-retention-enabled": false,
  "redirect-all-requests-to-https": false,
  "humanization-strategy": "simple",
  "enable-xrays": false,
  "search-engine": "appdb",
} as const;

const setup = async ({
  isCloudPlan,
  hasAuditApp,
  cspImgEnabled,
  customVizEnabled,
  isHosted,
  hasEmbeddingSdk,
  hasSimpleEmbedding,
}: {
  isCloudPlan?: boolean;
  hasAuditApp?: boolean;
  cspImgEnabled?: boolean;
  customVizEnabled?: boolean;
  isHosted?: boolean;
  hasEmbeddingSdk?: boolean;
  hasSimpleEmbedding?: boolean;
} = {}) => {
  // Direct control, bypassing hasPremiumFeature/MetabaseSettings singleton
  // timing -- deterministic regardless of what earlier tests in this worker
  // left behind.
  PLUGIN_EMBEDDING_SDK.isEnabled = () => hasEmbeddingSdk ?? false;

  const settings = createMockSettings({
    ...generalSettings,
    "csp-img-enabled": cspImgEnabled ?? generalSettings["csp-img-enabled"],
    "custom-viz-enabled":
      customVizEnabled ?? generalSettings["custom-viz-enabled"],
    "is-hosted?": isHosted ?? false,
    "token-features": createMockTokenFeatures({
      hosting: isCloudPlan ?? false,
      audit_app: hasAuditApp ?? true,
      embedding_sdk: hasEmbeddingSdk ?? false,
      embedding_simple: hasSimpleEmbedding ?? false,
    }),
  });

  fetchMock.get("https://mysite.biz/api/health", { status: 200 });

  setupPropertiesEndpoints(settings);

  setupDashboardEndpoints(
    createMockDashboard({
      id: 4242,
      name: "My dashboard",
    }),
  );

  setupUpdateSettingEndpoint();
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      // Unjustified type cast. FIXME
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-dev_instances",
    value: true,
  });

  renderWithProviders(
    <Route
      path="*"
      element={
        <>
          <GeneralSettingsPage />
          <UndoListing />
        </>
      }
    />,
    { withRouter: true, initialRoute: "/admin/settings/general" },
  );

  await screen.findByText("Site name");
};

describe("GeneralSettingsPage", () => {
  it("should render a GeneralSettingsPage", async () => {
    await setup();

    [
      "Site name",
      "Site url",
      "Redirect to HTTPS",
      "Homepage",
      "Email address for help requests",
      "Send anonymous tracking data to Metabase",
      "Collect user data to display in usage analytics",
      "Friendly table and field names",
      "Enable X-Ray features",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should make only 5 api calls", async () => {
    await setup();

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls();
      expect(calls).toHaveLength(5);
    });
    const calls = fetchMock.callHistory.calls();
    const urls = calls.map((call) => call.url);
    expect(urls).toContain("https://mysite.biz/api/health");
    expect(urls).toContainEqual(expect.stringContaining("/api/dashboard/4242"));
    expect(urls).toContainEqual(expect.stringContaining("/api/setting"));
    expect(urls).toContainEqual(
      expect.stringContaining("/api/session/properties"),
    );
  });

  it("should load existing values", async () => {
    await setup();

    expect(await screen.findByDisplayValue("Metabased")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("mysite.biz")).toBeInTheDocument();
  });

  it("should update multiple settings", async () => {
    await setup();

    const blur = async () => {
      const elementOutside = screen.getByText("Friendly table and field names");
      await userEvent.click(elementOutside); // blur
    };

    const nameInput = await screen.findByDisplayValue("Metabased");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Metabasey");
    blur();
    await screen.findByDisplayValue("Metabasey");

    const emailInput = await screen.findByDisplayValue("help@mysite.biz");
    await waitFor(() => {
      expect(emailInput).toBeEnabled();
    });
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "support@mySite.biz");
    blur();
    await screen.findByDisplayValue("support@mySite.biz");

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(2);
    });

    const puts = await findRequests("PUT");
    const { url: namePutUrl, body: namePutDetails } = puts[0];
    const { url: emailPutUrl, body: emailPutDetails } = puts[1];

    expect(namePutUrl).toContain("/api/setting/site-name");
    expect(namePutDetails).toEqual({ value: "Metabasey" });

    expect(emailPutUrl).toContain("/api/setting/admin-email");
    expect(emailPutDetails).toEqual({ value: "support@mySite.biz" });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(2);
    });
  });

  it("should show Anonymous Tracking input for non-cloud plans", async () => {
    await setup({ isCloudPlan: false });

    expect(
      screen.getByText("Send anonymous tracking data to Metabase"),
    ).toBeInTheDocument();
  });

  it("should not show Anonymous Tracking input if the plan is cloud", async () => {
    await setup({ isCloudPlan: true });

    expect(
      screen.queryByText("Send anonymous tracking data to Metabase"),
    ).not.toBeInTheDocument();
  });

  it("should show Collect User Data input when the audit_app token feature is enabled", async () => {
    await setup({ hasAuditApp: true });

    expect(
      screen.getByText("Collect user data to display in usage analytics"),
    ).toBeInTheDocument();
  });

  it("should not show Collect User Data input when the audit_app token feature is disabled", async () => {
    await setup({ hasAuditApp: false });

    expect(
      screen.queryByText("Collect user data to display in usage analytics"),
    ).not.toBeInTheDocument();
  });

  describe("Usage tracking section visibility", () => {
    it("should hide the Usage tracking section on Starter Cloud (hosting without audit_app)", async () => {
      await setup({ isCloudPlan: true, hasAuditApp: false });

      expect(screen.queryByText("Usage tracking")).not.toBeInTheDocument();
    });

    it("should show the Usage tracking section on Pro Cloud (hosting with audit_app)", async () => {
      await setup({ isCloudPlan: true, hasAuditApp: true });

      expect(screen.getByText("Usage tracking")).toBeInTheDocument();
    });

    it("should show the Usage tracking section on self-hosted OSS (no hosting, no audit_app)", async () => {
      await setup({ isCloudPlan: false, hasAuditApp: false });

      expect(screen.getByText("Usage tracking")).toBeInTheDocument();
    });

    it("should show the Usage tracking section on self-hosted EE (no hosting, audit_app)", async () => {
      await setup({ isCloudPlan: false, hasAuditApp: true });

      expect(screen.getByText("Usage tracking")).toBeInTheDocument();
    });
  });

  describe("Version pinning", () => {
    it("should offer users version pinning when they have a cloud instance with the SDK", async () => {
      await setup({ isHosted: true, hasEmbeddingSdk: true });

      expect(screen.getByText("Version pinning")).toBeInTheDocument();
      expect(
        screen.getByText(
          /Metabase Cloud instances are automatically upgraded to new releases/i,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Request version pinning" }),
      ).toBeInTheDocument();
    });

    it("should not offer version pinning on self-hosted instances", async () => {
      await setup({ isHosted: false, hasEmbeddingSdk: true });

      expect(screen.queryByText("Version pinning")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Request version pinning" }),
      ).not.toBeInTheDocument();
    });

    it("should not offer version pinning without the SDK feature", async () => {
      await setup({ isHosted: true, hasEmbeddingSdk: false });

      expect(screen.queryByText("Version pinning")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Request version pinning" }),
      ).not.toBeInTheDocument();
    });
  });
});
