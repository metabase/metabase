import { setupSdkPlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { reinitialize } from "metabase/plugins";
import { openUrl } from "metabase/urls";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { enterSdkMode } from "./enter-sdk-mode";

describe("enterSdkMode", () => {
  const url = "https://example.com/dashboard/1";

  beforeEach(() => {
    ensureMetabaseProviderPropsStore().cleanup();
    mockSettings({
      "token-features": createMockTokenFeatures({ embedding_sdk: true }),
    });
    setupSdkPlugins();
    enterSdkMode();
  });

  afterEach(() => {
    reinitialize();
    jest.restoreAllMocks();
    ensureMetabaseProviderPropsStore().cleanup();
  });

  it("should not open the url when handleLink returns { handled: true }", async () => {
    const handleLink = jest.fn().mockReturnValue({ handled: true });
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();

    await openUrl(url, { openInSameWindow, openInBlankWindow });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInSameWindow).not.toHaveBeenCalled();
    expect(openInBlankWindow).not.toHaveBeenCalled();
  });

  it("should open the url when handleLink returns { handled: false }", async () => {
    const handleLink = jest.fn().mockReturnValue({ handled: false });
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();

    await openUrl(url, { openInSameWindow, openInBlankWindow });

    expect(handleLink).toHaveBeenCalledWith(url);
    expect(openInBlankWindow).toHaveBeenCalledWith(url);
  });

  it("should throw when handleLink returns an invalid value", async () => {
    const handleLink = jest.fn().mockReturnValue(true);
    ensureMetabaseProviderPropsStore().setProps({
      pluginsConfig: { handleLink },
    });

    await expect(
      openUrl(url, {
        openInSameWindow: jest.fn(),
        openInBlankWindow: jest.fn(),
      }),
    ).rejects.toThrow(
      "handleLink plugin must return an object with a 'handled' property",
    );

    expect(handleLink).toHaveBeenCalledWith(url);
  });

  it("should open the url when the host app configures no handleLink plugin", async () => {
    const openInSameWindow = jest.fn();
    const openInBlankWindow = jest.fn();

    await openUrl(url, { openInSameWindow, openInBlankWindow });

    expect(openInBlankWindow).toHaveBeenCalledWith(url);
  });
});
