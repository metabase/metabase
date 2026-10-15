import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { CloudSettingsPage } from "./CloudSettingsPage";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
// Reached via requireMock because the lint rule forbids importing
// `trackSchemaEvent` outside analytics files.
const { trackSchemaEvent: mockTrackSchemaEvent } = jest.requireMock<{
  trackSchemaEvent: jest.Mock;
}>("metabase/analytics");

const STORE_URL = "https://test-store.metabase.com";

type SetupOpts = {
  hosting: boolean;
};

const setup = ({ hosting }: SetupOpts) => {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ hosting }),
    "store-url": STORE_URL,
  });

  fetchMock.get("path:/api/cloud-migration", { status: 204 });
  setupPropertiesEndpoints(settings);

  renderWithProviders(<CloudSettingsPage />, {
    storeInitialState: {
      // upsells only display to admins
      currentUser: createMockUser({ is_superuser: true }),
      settings: createMockSettingsState(settings),
    },
  });
};

const getUpsellEvents = (event: string) =>
  mockTrackSchemaEvent.mock.calls.filter(
    ([schema, data]) => schema === "upsell" && data?.event === event,
  );

describe("CloudSettingsPage", () => {
  beforeEach(() => {
    mockTrackSchemaEvent.mockClear();
  });

  it("should show migration upsell for admins without hosting", async () => {
    setup({ hosting: false });

    expect(
      await screen.findByRole("heading", { name: "Migrate to Metabase Cloud" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try for free" }),
    ).toBeInTheDocument();
  });

  it("should report the cloud upsell view once", async () => {
    setup({ hosting: false });

    await screen.findByText("Migrate to Metabase Cloud");

    const viewed = getUpsellEvents("upsell_viewed");
    expect(viewed).toHaveLength(1);
    expect(viewed[0][1]).toMatchObject({ promoted_feature: "cloud" });
  });

  it("should show link to store for users with hosting", async () => {
    setup({ hosting: true });

    expect(
      await screen.findByRole("link", { name: /Go to the Metabase Store/ }),
    ).toHaveAttribute("href", `${STORE_URL}/`);
    expect(
      screen.queryByText("Migrate to Metabase Cloud"),
    ).not.toBeInTheDocument();
    expect(getUpsellEvents("upsell_viewed")).toHaveLength(0);
  });
});
