import type { ReactNode } from "react";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { useSdkSelector } from "embedding-sdk-bundle/store";
import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";
import { useSdkIframeEmbedEventBus } from "metabase/embedding/embedding-iframe-sdk/hooks/use-sdk-iframe-embed-event-bus";
import type { SdkIframeEmbedSettings } from "metabase/embedding/embedding-iframe-sdk/types/embed";
import { PLUGIN_EMBEDDING_IFRAME_SDK } from "metabase/plugins";

import { useDataAppBundle } from "../../../lib/use-data-app-bundle";

jest.mock("../../../lib/use-data-app-bundle");

jest.mock(
  "metabase/embedding/embedding-iframe-sdk/hooks/use-sdk-iframe-embed-event-bus",
);

jest.mock("embedding-sdk-bundle/store", () => ({
  ...jest.requireActual("embedding-sdk-bundle/store"),
  useSdkSelector: jest.fn(),
}));

jest.mock("embedding-sdk-bundle/components/public/ComponentProvider", () => ({
  ComponentProvider: jest.fn(
    ({ children }: { children: ReactNode }) => children,
  ),
}));

export const mockComponentProvider = jest.mocked(ComponentProvider);
export const mockUseSdkSelector = jest.mocked(useSdkSelector);
export const mockUseDataAppBundle = jest.mocked(useDataAppBundle);

export const mockUseSdkIframeEmbedEventBus = jest.mocked(
  useSdkIframeEmbedEventBus,
);

type Settings = Extract<
  SdkIframeEmbedSettings,
  { componentName: "metabase-data-app" }
>;

export function setupSettings(overrides: Partial<Settings> = {}) {
  mockUseSdkIframeEmbedEventBus.mockReturnValue({
    sendMessage: jest.fn(),
    embedSettings: {
      componentName: "metabase-data-app",
      path: "sales/orders?active=true",
      instanceUrl: window.location.origin,
      ...overrides,
    },
  });
}

export function setup() {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/embed/embedded-apps/sales");
  jest.spyOn(PLUGIN_EMBEDDING_IFRAME_SDK, "isEnabled").mockReturnValue(true);

  setupSettings();
  mockUseSdkSelector.mockReturnValue({ status: "success" });
  mockUseDataAppBundle.mockReturnValue({ data: null, failed: false });
}

export function cleanup() {
  window.history.replaceState(null, "", "/");
  ensureMetabaseProviderPropsStore().cleanup();
  jest.restoreAllMocks();
}
