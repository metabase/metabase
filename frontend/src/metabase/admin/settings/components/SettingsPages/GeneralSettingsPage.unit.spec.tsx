import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDashboardEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockDashboard,
  createMockSettingDefinition,
  createMockSettings,
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
  "redirect-all-requests-to-https": false,
  "humanization-strategy": "simple",
  "enable-xrays": false,
  "allowed-iframe-hosts": "https://cooldashboards.limo",
} as const;

const setup = async () => {
  const settings = createMockSettings(generalSettings);

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
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "upsell-dev_instances",
    value: true,
  });

  renderWithProviders(
    <>
      <GeneralSettingsPage />
      <UndoListing />
    </>,
  );

  await screen.findByText("Redirect to HTTPS");
};

describe("GeneralSettingsPage", () => {
  it("should render a GeneralSettingsPage", async () => {
    await setup();

    [
      "Site name",
      "Site url",
      "Redirect to HTTPS",
      "Custom homepage",
      "Email address for help requests",
      "Anonymous tracking",
      "Friendly table and field names",
      "Enable X-Ray features",
      "Allowed domains for iframes in dashboards",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should make only 4 api calls", async () => {
    await setup();

    await waitFor(() => {
      const calls = fetchMock.calls();
      const urls = calls.map((call) => call[0]);
      expect(urls).toHaveLength(5);
    });
    const calls = fetchMock.calls();
    const urls = calls.map((call) => call[0]);
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
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "support@mySite.biz");
    blur();
    await screen.findByDisplayValue("support@mySite.biz");

    await waitFor(async () => {
      const puts = await findPuts();
      expect(puts).toHaveLength(2);
    });

    const puts = await findPuts();
    const [namePutUrl, namePutDetails] = puts[0];
    const [emailPutUrl, emailPutDetails] = puts[1];

    expect(namePutUrl).toContain("/api/setting/site-name");
    expect(namePutDetails).toEqual({ value: "Metabasey" });

    expect(emailPutUrl).toContain("/api/setting/admin-email");
    expect(emailPutDetails).toEqual({ value: "support@mySite.biz" });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(2);
    });
  });
});

async function findPuts() {
  const calls = fetchMock.calls();
  const data = calls.filter((call) => call[1]?.method === "PUT") ?? [];

  const puts = data.map(async ([putUrl, putDetails]) => {
    const body = ((await putDetails?.body) as string) ?? "{}";

    return [putUrl, JSON.parse(body ?? "{}")];
  });

  return Promise.all(puts);
}
