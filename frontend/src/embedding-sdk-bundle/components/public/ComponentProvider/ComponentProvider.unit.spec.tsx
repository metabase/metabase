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
import { useLocale } from "metabase/common/hooks/use-locale";

import { ComponentProvider } from "./ComponentProvider";

const mockUseInitSdkTracker = jest.mocked(useInitSdkTracker);

/** Reports when `LocaleProvider` has finished loading the catalogue it asks for. */
const LocaleProbe = () => {
  const { isLocaleLoading } = useLocale();
  return <div>{isLocaleLoading ? "locale loading" : "locale ready"}</div>;
};

describe("ComponentProvider — unsupported host React", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    jest.mocked(isHostReactVersionSupported).mockReturnValue(true);
  });

  it("renders the unsupported React error instead of the SDK", () => {
    jest.mocked(isHostReactVersionSupported).mockReturnValue(false);

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
  });
});

describe("ComponentProvider — tracker wiring", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("passes locale != null as the third argument when locale is set", async () => {
    renderWithSDKProviders(<LocaleProbe />, {
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

    // Asking for a locale loads a catalogue, and the provider updates when it
    // lands. Wait for that rather than leaving it to resolve after the test.
    expect(await screen.findByText("locale ready")).toBeInTheDocument();
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
