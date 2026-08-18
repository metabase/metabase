import fetchMock from "fetch-mock";

import { setupUserKeyValueEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { GuidePage } from "./GuidePage";

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => <div data-testid="app-switcher" />,
}));

const HAS_SEEN_GUIDE_PATH =
  "path:/api/user-key-value/namespace/data_studio/key/hasSeenGuide";

interface SetupOpts {
  hasSeenGuide?: boolean;
  hasLibraryFeature?: boolean;
}

function setup({
  hasSeenGuide = false,
  hasLibraryFeature = false,
}: SetupOpts = {}) {
  setupUserKeyValueEndpoints({
    namespace: "data_studio",
    key: "hasSeenGuide",
    value: hasSeenGuide,
  });

  const state = createMockState({
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          library: hasLibraryFeature,
        }),
      }),
    ),
  });

  renderWithProviders(<GuidePage />, { storeInitialState: state });
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

  it("renders the guide sections without the library feature", async () => {
    setup({ hasSeenGuide: true, hasLibraryFeature: false });

    expect(
      await screen.findByText("Transform your data to make it easier to query"),
    ).toBeInTheDocument();
    expect(screen.getByText("Add context to your data")).toBeInTheDocument();
    expect(
      screen.getByText("Define key terms in the Glossary"),
    ).toBeInTheDocument();
  });

  it("renders the guide sections with the library feature", async () => {
    setup({ hasSeenGuide: true, hasLibraryFeature: true });

    expect(
      await screen.findByText("Transform your data to make it easier to query"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Publish query-ready tables to the Semantic Layer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Define key metrics and terms"),
    ).toBeInTheDocument();
  });
});
