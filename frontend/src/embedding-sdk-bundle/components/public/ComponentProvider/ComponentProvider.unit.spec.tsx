jest.mock("embedding-sdk-bundle/analytics/tracker", () => ({
  useInitSdkTracker: jest.fn(),
}));

// Heavy hooks not under test — prevent real network/redux side-effects.
jest.mock("embedding-sdk-bundle/hooks/private/use-init-data", () => ({
  useInitDataInternal: jest.fn(),
}));

import { screen } from "__support__/ui";
import { useInitSdkTracker } from "embedding-sdk-bundle/analytics/tracker";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";

const mockUseInitSdkTracker = jest.mocked(useInitSdkTracker);

describe("ComponentProvider — tracker wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls useInitSdkTracker with 3 arguments", () => {
    renderWithSDKProviders(<div data-testid="child" />, {
      componentProviderProps: {
        authConfig: { metabaseInstanceUrl: "https://metabase.example.com" },
      },
    });

    screen.getByTestId("child");
    expect(mockUseInitSdkTracker).toHaveBeenCalled();
    expect(mockUseInitSdkTracker.mock.calls[0]).toHaveLength(3);
  });

  it("passes locale != null as the third argument when locale is set", () => {
    renderWithSDKProviders(<div />, {
      componentProviderProps: {
        authConfig: { metabaseInstanceUrl: "https://metabase.example.com" },
        locale: "en",
      },
    });

    expect(mockUseInitSdkTracker.mock.calls[0][2]).toBe(true);
  });

  it("passes false as the third argument when locale is not set", () => {
    renderWithSDKProviders(<div />, {
      componentProviderProps: {
        authConfig: { metabaseInstanceUrl: "https://metabase.example.com" },
        locale: undefined,
      },
    });

    expect(mockUseInitSdkTracker.mock.calls[0][2]).toBe(false);
  });
});
