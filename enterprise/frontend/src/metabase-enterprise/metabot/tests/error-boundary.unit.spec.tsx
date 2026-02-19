import { combineReducers } from "@reduxjs/toolkit";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { assocIn } from "icepick";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { Metabot } from "../components/Metabot";
import { FIXED_METABOT_IDS } from "../constants";
import { MetabotProvider } from "../context";
import { metabotReducer } from "../state";
import { getMetabotInitialState } from "../state/reducer-utils";

let mockShouldThrow = false;

jest.mock("../components/MetabotChat", () => {
  const metabotChatModule = jest.requireActual("../components/MetabotChat");
  return {
    ...metabotChatModule,
    MetabotChat: (props: any) => {
      if (mockShouldThrow) {
        throw new Error("Test error for ErrorBoundary");
      }
      return <metabotChatModule.MetabotChat {...props} />;
    },
  };
});

function setup() {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      metabot_v3: true,
    }),
  });

  setupEnterprisePlugins();

  const metabotState = assocIn(
    getMetabotInitialState(),
    ["conversations", "omnibot", "visible"],
    true,
  );

  fetchMock.get(
    `path:/api/ee/metabot-v3/metabot/${FIXED_METABOT_IDS.DEFAULT}/prompt-suggestions`,
    { prompts: [], offset: 0, limit: 3, total: 0 },
  );

  renderWithProviders(
    <MetabotProvider>
      <Metabot />
    </MetabotProvider>,
    {
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser(),
        plugins: {
          metabotPlugin: metabotState,
        },
      } as any),
      customReducers: {
        plugins: combineReducers({
          metabotPlugin: metabotReducer,
        }),
      },
    },
  );
}

describe("metabot error boundary", () => {
  beforeEach(() => {
    mockShouldThrow = false;
  });

  it("should show error fallback and recover when clicking try again", async () => {
    // prevent large amount of error content to get logged for our expected errors
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockShouldThrow = true;

    setup();

    // Error fallback should be shown
    expect(
      await screen.findByTestId("metabot-error-fallback"),
    ).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();

    // MetabotChat should not be visible
    expect(screen.queryByTestId("metabot-chat")).not.toBeInTheDocument();

    // Allow recovery on next render
    mockShouldThrow = false;

    await userEvent.click(screen.getByTestId("metabot-error-retry"));
    expect(await screen.findByTestId("metabot-chat")).toBeInTheDocument();
    expect(
      screen.queryByTestId("metabot-error-fallback"),
    ).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
