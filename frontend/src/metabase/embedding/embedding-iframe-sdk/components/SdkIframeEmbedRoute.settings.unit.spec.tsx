import type { ReactNode } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { sdkReducers } from "embedding-sdk-bundle/store";

import { useSdkIframeEmbedEventBus } from "../hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "../types/embed";

import { SdkIframeEmbedRoute } from "./SdkIframeEmbedRoute";

jest.mock("metabase/utils/metaplow", () => ({
  getCollectorHostUrl: jest.fn(() => "https://collector.example.com/api"),
  initMetaplow: jest.fn(),
  trackMetaplowEvent: jest.fn(),
  trackMetaplowPageView: jest.fn(),
}));

jest.mock("../hooks/use-sdk-iframe-embed-event-bus", () => ({
  useSdkIframeEmbedEventBus: jest.fn(),
}));

// The SDK provider authenticates against a real instance, which the route
// does not influence: the dashboards below only record the props it passes.
jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock("embedding-sdk-bundle/components/public/dashboard", () => ({
  InteractiveDashboard: ({ withDownloads }: { withDownloads?: boolean }) => (
    <div data-testid="interactive-dashboard">
      {`withDownloads: ${String(withDownloads)}`}
    </div>
  ),
  StaticDashboard: () => null,
}));

// The mock replaces the whole module, so the hook has to be typed back here.
const useSdkIframeEmbedEventBusMock = jest.mocked(useSdkIframeEmbedEventBus);

const setup = ({ withDownloads }: { withDownloads: boolean }) => {
  const embedSettings: SdkIframeEmbedSettings = {
    componentName: "metabase-dashboard",
    instanceUrl: "http://localhost:3000",
    dashboardId: 1,
    withDownloads,
    _isLocalhost: true,
  };
  useSdkIframeEmbedEventBusMock.mockReturnValue({
    embedSettings,
    sendMessage: jest.fn(),
  });

  renderWithProviders(<SdkIframeEmbedRoute />, {
    customReducers: sdkReducers,
  });
};

describe("SdkIframeEmbedRoute", () => {
  it("should hide PDF download button when with-downloads is false (the route passes withDownloads to the interactive dashboard)", () => {
    setup({ withDownloads: false });

    expect(screen.getByTestId("interactive-dashboard")).toHaveTextContent(
      "withDownloads: false",
    );
  });

  it("should keep PDF downloads enabled when with-downloads is true (positive control: the route passes withDownloads through as is)", () => {
    setup({ withDownloads: true });

    expect(screen.getByTestId("interactive-dashboard")).toHaveTextContent(
      "withDownloads: true",
    );
  });
});
