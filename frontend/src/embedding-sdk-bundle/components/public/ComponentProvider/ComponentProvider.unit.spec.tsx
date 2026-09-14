jest.mock("embedding-sdk-bundle/analytics/tracker", () => ({
  useInitSdkTracker: jest.fn(),
}));

// Heavy hooks not under test — prevent real network/redux side-effects.
jest.mock("embedding-sdk-bundle/hooks/private/use-init-data", () => ({
  useInitDataInternal: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/lib/host-react-version", () => ({
  ...jest.requireActual("embedding-sdk-bundle/lib/host-react-version"),
  isHostReactVersionSupported: jest.fn(() => true),
}));

import { render, screen } from "__support__/ui";
import { useInitSdkTracker } from "embedding-sdk-bundle/analytics/tracker";
import { isHostReactVersionSupported } from "embedding-sdk-bundle/lib/host-react-version";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";

import { ComponentProvider } from "./ComponentProvider";

const mockUseInitSdkTracker = jest.mocked(useInitSdkTracker);

describe("ComponentProvider — unsupported host React", () => {
  it("renders the unsupported React error instead of the SDK", () => {
    jest.mocked(isHostReactVersionSupported).mockReturnValue(false);
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // renderWithSDKProviders mounts ComponentProviderInternal, below the guard.
    render(
      <ComponentProvider
        authConfig={{ metabaseInstanceUrl: "https://metabase.example.com" }}
      >
        <div>sdk content</div>
      </ComponentProvider>,
    );

    expect(
      screen.getByTestId("sdk-unsupported-react-version-error"),
    ).toBeInTheDocument();
    expect(screen.queryByText("sdk content")).not.toBeInTheDocument();
    expect(mockUseInitSdkTracker).not.toHaveBeenCalled();

    consoleError.mockRestore();
    jest.mocked(isHostReactVersionSupported).mockReturnValue(true);
  });
});

describe("ComponentProvider — tracker wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes locale != null as the third argument when locale is set", () => {
    renderWithSDKProviders(<div />, {
      componentProviderProps: {
        authConfig: { metabaseInstanceUrl: "https://metabase.example.com" },
        locale: "en",
      },
    });

    expect(mockUseInitSdkTracker).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      true,
    );
  });

  it("passes false as the third argument when locale is not set", () => {
    renderWithSDKProviders(<div />, {
      componentProviderProps: {
        authConfig: { metabaseInstanceUrl: "https://metabase.example.com" },
        locale: undefined,
      },
    });

    expect(mockUseInitSdkTracker).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      false,
    );
  });
});
