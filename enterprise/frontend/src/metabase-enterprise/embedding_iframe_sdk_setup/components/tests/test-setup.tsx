import {
  findRequests,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import {
  createMockDashboard,
  createMockDashboardQueryMetadata,
  createMockDatabase,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { SdkIframeEmbedSetupModal } from "../SdkIframeEmbedSetupModal";

const mockUseLocation = jest.fn();

jest.mock("react-use", () => ({
  ...jest.requireActual("react-use"),
  useLocation: () => mockUseLocation(),
}));

export const setup = (options?: {
  simpleEmbeddingEnabled?: boolean;
  jwtReady?: boolean;
  urlSearchParams?: string;
}) => {
  const mockDatabase = createMockDatabase();
  const mockDashboard = createMockDashboard();
  setupRecentViewsAndSelectionsEndpoints([], ["selections", "views"]);
  setupSearchEndpoints([]);
  setupDashboardEndpoints(mockDashboard);
  setupDashboardQueryMetadataEndpoint(
    mockDashboard,
    createMockDashboardQueryMetadata({
      databases: [mockDatabase],
    }),
  );
  setupUpdateSettingsEndpoint();
  setupUpdateSettingEndpoint();

  mockUseLocation.mockReturnValue({
    search: options?.urlSearchParams || "",
  });

  renderWithProviders(
    <SdkIframeEmbedSetupModal
      opened
      initialState={{
        useExistingUserSession: true,
      }}
      onClose={jest.fn()}
    />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState({
          "enable-embedding-simple": options?.simpleEmbeddingEnabled ?? false,
          "jwt-enabled": options?.jwtReady ?? false,
          "jwt-configured": options?.jwtReady ?? false,
        }),
      }),
    },
  );
};

export async function waitForPutRequests() {
  return waitFor(async () => {
    const puts = await findRequests("PUT");
    expect(puts.length).toBeGreaterThan(0);
    return puts;
  });
}

export async function waitForUpdateSetting(settingKey: string, value: any) {
  return waitFor(async () => {
    const puts = await findRequests("PUT");

    return puts.find(
      (request) =>
        request.url.includes("/api/setting") &&
        request.body[settingKey] === value,
    );
  });
}
