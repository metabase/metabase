import fetchMock from "fetch-mock";

import { setupUserKeyValueEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { GuidePage } from "./GuidePage";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => <div data-testid="app-switcher" />,
}));

const HAS_SEEN_GUIDE_PATH =
  "path:/api/user-key-value/namespace/data_studio/key/hasSeenGuide";

function setup({ hasSeenGuide = false }: { hasSeenGuide?: boolean } = {}) {
  setupUserKeyValueEndpoints({
    namespace: "data_studio",
    key: "hasSeenGuide",
    value: hasSeenGuide,
  });

  renderWithProviders(<GuidePage />);
}

function wasVisitRecorded() {
  return fetchMock.callHistory.called(HAS_SEEN_GUIDE_PATH, { method: "PUT" });
}

describe("GuidePage", () => {
  it("records the visit the first time the guide is seen", async () => {
    setup({ hasSeenGuide: false });

    await waitFor(() => expect(wasVisitRecorded()).toBe(true));

    const [request] = fetchMock.callHistory.calls(HAS_SEEN_GUIDE_PATH, {
      method: "PUT",
    });
    expect(request?.options?.body).toBe(JSON.stringify({ value: true }));
  });

  it("does not re-record the visit when the guide was already seen", async () => {
    setup({ hasSeenGuide: true });

    expect(
      await screen.findByText("Build your semantic layer in Data Studio"),
    ).toBeInTheDocument();
    expect(wasVisitRecorded()).toBe(false);
  });
});
