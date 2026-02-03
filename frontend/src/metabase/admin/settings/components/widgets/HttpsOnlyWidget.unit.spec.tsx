import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { HttpsOnlyWidget } from "./HttpsOnlyWidget";

const setup = (
  { hosting, url }: { url?: string; hosting?: boolean } = {
    hosting: false,
    url: "https://mysite.biz",
  },
) => {
  const settings = createMockSettings({
    "redirect-all-requests-to-https": false,
    "site-url": url,
    "token-features": createMockTokenFeatures({ hosting }),
  });

  setupPropertiesEndpoints(settings);

  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "redirect-all-requests-to-https",
      value: false,
    }),
    createMockSettingDefinition({
      key: "site-url",
      value: url,
    }),
  ]);

  return renderWithProviders(
    <div>
      <HttpsOnlyWidget />
      <UndoListing />
    </div>,
  );
};

const mockAccessible = (delay = 10) => {
  fetchMock.get(
    "https://mysite.biz/api/health",
    {
      status: 200,
    },
    { delay },
  );
};

const mockNotAccessible = () => {
  fetchMock.get("https://mysite.biz/api/health", {
    status: 404,
  });
};

describe("HttpsOnlyWidget", () => {
  it("should render a HttpsOnlyWidget", async () => {
    mockAccessible();
    setup();
    expect(await screen.findByText("Redirect to HTTPS")).toBeInTheDocument();
  });

  it("should not display or check for an http site", async () => {
    setup({ url: "http://myinsecuresite.guru" });

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls();
      expect(calls.length).toBe(2);
    });

    const calls = fetchMock.callHistory.calls();

    const urls = calls.map((call) => call.request?.url);
    expect(urls).not.toContain("http://myinsecuresite.guru/api/health");
    expect(urls).not.toContain("https://myinsecuresite.guru/api/health");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTPS/i)).not.toBeInTheDocument();
  });

  it("should not check https for a hosted site", async () => {
    setup({ hosting: true });

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls();
      expect(calls.length).toBe(2);
    });

    const calls = fetchMock.callHistory.calls();

    const urls = calls.map((call) => call.request?.url);
    expect(urls).not.toContain("https://mysite.biz/api/health");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/HTTPS/i)).not.toBeInTheDocument();
  });

  it("should display an error message if the site is not accessible via https", async () => {
    mockNotAccessible();
    setup();
    expect(
      await screen.findByText("It looks like HTTPS is not properly configured"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("should display a message while checking", async () => {
    // Use a longer delay to ensure we can catch the "checking" state
    mockAccessible(300);
    setup();

    // Wait for the checking status to appear
    expect(await screen.findByText("Checking HTTPS...")).toBeInTheDocument();

    // Then wait for it to complete to maintain test flow
    expect(await screen.findByText("Redirect to HTTPS")).toBeInTheDocument();
  });

  it("should display the setting if the https site is reachable", async () => {
    mockAccessible();
    setup();
    expect(await screen.findByRole("switch")).toBeInTheDocument();
  });

  it("should update the setting when the input is changed", async () => {
    mockAccessible();
    setup();
    const input = await screen.findByRole("switch");

    await userEvent.click(input);

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/redirect-all-requests-to-https");
    expect(body).toEqual({ value: true });
  });
});
