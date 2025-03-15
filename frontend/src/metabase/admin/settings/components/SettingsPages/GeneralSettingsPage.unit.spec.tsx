import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDashboardEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
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

  renderWithProviders(
    <div>
      <GeneralSettingsPage />
      <UndoListing />
    </div>,
  );

  await screen.findByText("Redirect to HTTPS");
};

describe("GeneralSettingsPage", () => {
  it("should render a GeneralSettingsPage", async () => {
    await setup();

    [
      "Site Name",
      "Site Url",
      "Redirect to HTTPS",
      "Custom Homepage",
      "Email Address for Help Requests",
      "Anonymous Tracking",
      "Friendly Table and Field Names",
      "Enable X-Ray Features",
      "Allowed domains for iframes in dashboards",
    ].forEach(text => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should make only 4 api calls", async () => {
    await setup();

    await waitFor(() => {
      const calls = fetchMock.calls();
      const urls = calls.map(call => call[0]);
      expect(urls).toHaveLength(4);
    });
    const calls = fetchMock.calls();
    const urls = calls.map(call => call[0]);
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

    const emailInput = await screen.findByDisplayValue("help@mysite.biz");
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "support@mySite.biz");
    await fireEvent.blur(emailInput);
    await screen.findByDisplayValue("support@mySite.biz");

    const nameInput = await screen.findByDisplayValue("Metabased");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Metabasey");
    await fireEvent.blur(nameInput);
    await screen.findByDisplayValue("Metabasey");

    const [[emailPutUrl, emailPutDetails], [namePutUrl, namePutDetails]] =
      await findPuts();

    // FIXME, this is calling put twice, but only one of them is expected
    expect(emailPutUrl).toContain("/api/setting/admin-email");
    expect(emailPutDetails).toEqual({ value: "support@mySite.biz" });

    expect(namePutUrl).toContain("/api/setting/site-name");
    expect(namePutDetails).toEqual({ value: "Metabasey" });

    const toasts = screen.getAllByRole("status");
    expect(toasts).toHaveLength(2);
  });
});

async function findPuts() {
  const calls = fetchMock.calls();
  const data = calls.filter(call => call[1]?.method === "PUT") ?? [];

  const puts = data.map(async ([putUrl, putDetails]) => {
    const body = ((await putDetails?.body) as string) ?? "{}";

    return [putUrl, JSON.parse(body ?? "{}")];
  });

  return Promise.all(puts);
}
