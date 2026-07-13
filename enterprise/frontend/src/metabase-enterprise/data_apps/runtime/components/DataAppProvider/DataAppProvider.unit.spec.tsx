import { render, screen } from "@testing-library/react";

import { useHostSdkStore } from "../../lib/use-host-sdk-store";
import { DataAppErrorState } from "../DataAppErrorState/DataAppErrorState";

import { DataAppProvider } from "./DataAppProvider";

// The SDK theme/portal wrappers read from the SDK redux store; stub them so the
// test can use a bare fake store and stay focused on DataAppProvider's own wiring.
jest.mock("embedding-sdk-bundle/components/private/SdkThemeProvider", () => ({
  SdkThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock("embedding-sdk-bundle/components/private/SdkPortalContainer", () => ({
  PortalContainer: () => null,
}));
jest.mock("../../lib/use-host-sdk-store", () => ({
  useHostSdkStore: jest.fn(),
}));

const mockedUseHostSdkStore = jest.mocked(useHostSdkStore);

const setup = (providerProps?: Record<string, unknown>) => {
  // Minimal store: react-redux's Provider only needs these three; the SDK
  // wrappers that would call selectors are mocked out above.
  mockedUseHostSdkStore.mockReturnValue({
    getState: () => ({}),
    subscribe: () => () => {},
    dispatch: () => {},
  } as unknown as ReturnType<typeof useHostSdkStore>);

  render(
    <DataAppProvider appName="test-app" providerProps={providerProps}>
      <div>app content</div>
    </DataAppProvider>,
  );
};

describe("DataAppProvider", () => {
  afterEach(() => jest.clearAllMocks());

  it("renders its children", () => {
    setup();
    expect(screen.getByText("app content")).toBeInTheDocument();
  });

  // Regression guard: the neutral error component must be registered in the
  // shared MetabaseProvider props store (via useHostSdkStore -> setProps), not
  // only dispatched to redux. Every SDK component the app renders remounts a
  // ComponentProvider that runs `setErrorComponent(props.errorComponent ?? null)`,
  // so a redux-only override gets reset back to `null` on a cold page load.
  it("registers the data-app error component through the props store", () => {
    setup();

    expect(mockedUseHostSdkStore).toHaveBeenCalledWith(
      expect.objectContaining({ errorComponent: DataAppErrorState }),
    );
  });

  it("forwards the data app's provider props alongside the error component", () => {
    const theme = { colors: { brand: "#123456" } };
    setup({ theme });

    expect(mockedUseHostSdkStore).toHaveBeenCalledWith(
      expect.objectContaining({ theme, errorComponent: DataAppErrorState }),
    );
  });

  it("still registers the error component when no provider props are given", () => {
    setup(undefined);

    expect(mockedUseHostSdkStore).toHaveBeenCalledWith(
      expect.objectContaining({ errorComponent: DataAppErrorState }),
    );
  });

  it("lets an app override the default error component with its own", () => {
    const AppErrorComponent = () => <div>app error</div>;
    setup({ errorComponent: AppErrorComponent });

    expect(mockedUseHostSdkStore).toHaveBeenCalledWith(
      expect.objectContaining({ errorComponent: AppErrorComponent }),
    );
  });
});
