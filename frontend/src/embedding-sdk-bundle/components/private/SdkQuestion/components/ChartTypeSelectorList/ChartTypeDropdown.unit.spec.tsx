import { screen } from "@testing-library/react";

import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import {
  createMockUser,
  createMockUserPermissions,
} from "metabase-types/api/mocks";

import { SdkQuestionProvider } from "../../context";

import { ChartTypeDropdown } from "./ChartTypeDropdown";

describe("ChartTypeDropdown", () => {
  it("should have overflow: 'auto' (matabase#67209)", async () => {
    const user = createMockUser({
      permissions: createMockUserPermissions({
        can_create_queries: true,
      }),
    });

    const state = setupSdkState({
      currentUser: user,
    });

    await renderWithSDKProviders(
      <SdkQuestionProvider>
        <ChartTypeDropdown defaultOpened />
      </SdkQuestionProvider>,
      {
        componentProviderProps: {
          authConfig: createMockSdkConfig(),
        },
        storeInitialState: state,
      },
    );

    const container = screen.getByRole("menu");

    expect(container).toHaveStyle({
      overflow: "auto",
    });
  });
});
