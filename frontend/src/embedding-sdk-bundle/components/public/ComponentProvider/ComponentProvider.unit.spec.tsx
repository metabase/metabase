import { act } from "@testing-library/react";

import { useInitSdkTracker } from "embedding-sdk-bundle/analytics/tracker";
import { PLUGIN_EMBEDDING_SDK_AUTH } from "embedding-sdk-bundle/plugins/auth";
import { refreshTokenAsync } from "embedding-sdk-bundle/store/auth";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { enterSdkMode } from "metabase/embedding-sdk/lib/enter-sdk-mode";
import { reinitialize } from "metabase/plugins";
import { initializePlugins } from "sdk-ee-plugins";

jest.mock("embedding-sdk-bundle/analytics/tracker", () => ({
  useInitSdkTracker: jest.fn(),
}));

// Heavy hooks not under test — prevent real network/redux side-effects.
jest.mock("embedding-sdk-bundle/hooks/private/use-init-data", () => ({
  useInitDataInternal: jest.fn(),
}));

const mockUseInitSdkTracker = jest.mocked(useInitSdkTracker);

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

jest.mock("sdk-ee-plugins", () => ({ initializePlugins: jest.fn() }));

describe("ComponentProvider plugin reset lifecycle", () => {
  beforeEach(() => {
    reinitialize();
    enterSdkMode();
    jest.mocked(initializePlugins).mockImplementation(() => {
      PLUGIN_EMBEDDING_SDK_AUTH.refreshTokenAsync = async () => ({
        id: "sdk-session",
      });
    });
  });

  afterEach(reinitialize);

  it("can refresh the SDK session after resetting and mounting a new provider", async () => {
    const config = { metabaseInstanceUrl: "https://metabase.example.com" };
    const { store: firstStore, unmount: unmountFirst } = renderWithSDKProviders(
      <div />,
      {
        componentProviderProps: { authConfig: config },
      },
    );
    await act(async () => {
      await expect(
        firstStore.dispatch(refreshTokenAsync(config)).unwrap(),
      ).resolves.toEqual({ id: "sdk-session" });
    });
    unmountFirst();

    reinitialize();
    enterSdkMode();

    const { store: secondStore, unmount: unmountSecond } =
      renderWithSDKProviders(<div />, {
        componentProviderProps: { authConfig: config },
      });
    await act(async () => {
      await expect(
        secondStore.dispatch(refreshTokenAsync(config)).unwrap(),
      ).resolves.toEqual({ id: "sdk-session" });
    });
    unmountSecond();
  });
});
