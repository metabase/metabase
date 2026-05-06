import { screen, waitFor } from "@testing-library/react";

import {
  findRequests,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import {
  createMockLoginStatusState,
  createMockSdkState,
} from "embedding-sdk-bundle/test/mocks/state";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";

import { QuestionAlertsButton } from "./QuestionAlertsButton";

jest.mock(
  "embedding-sdk-bundle/components/private/SdkQuestion/context",
  () => ({
    useSdkQuestionContext: () => ({
      withAlerts: true,
      question: {
        isSaved: () => true,
        type: () => "question",
        collection: () => ({}),
      },
    }),
  }),
);

jest.mock(
  "embedding-sdk-bundle/components/private/notifications/context/QuestionAlertModalProvider",
  () => ({
    useQuestionAlertModalContext: () => ({
      toggle: jest.fn(),
      close: jest.fn(),
      isOpen: false,
    }),
  }),
);

function setup({ isGuestEmbed }: { isGuestEmbed: boolean }) {
  setupNotificationChannelsEndpoints({
    email: { configured: true },
  } as any);

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: true,
      permissions: { can_access_subscription: true },
    }),
    settings: {
      values: {
        ...createMockSettings({ "enable-embedding-sdk": true }),
        "token-features": {
          embedding_sdk: true,
          advanced_permissions: false,
        },
      } as any,
    },
    sdk: createMockSdkState({
      isGuestEmbed,
      initStatus: createMockLoginStatusState({ status: "success" }),
    }),
  });

  renderWithSDKProviders(<QuestionAlertsButton />, {
    componentProviderProps: {
      authConfig: createMockSdkConfig(),
    },
    storeInitialState: state,
  });
}

async function getFormInputRequests() {
  const gets = await findRequests("GET");
  return gets.filter((req) => req.url.match(/\/api\/pulse\/form_input$/));
}

describe("QuestionAlertsButton", () => {
  it("should render the alerts button and call pulse/form_input when not in guest embed mode", async () => {
    setup({ isGuestEmbed: false });

    await waitFor(async () => {
      expect(await getFormInputRequests()).toHaveLength(1);
    });

    expect(
      await screen.findByRole("button", { name: "Alerts" }),
    ).toBeInTheDocument();
  });

  it("should not render the alerts button and should not call pulse/form_input in guest embed mode (EMB-1525)", async () => {
    setup({ isGuestEmbed: true });

    expect(
      screen.queryByRole("button", { name: "Alerts" }),
    ).not.toBeInTheDocument();

    expect(await getFormInputRequests()).toHaveLength(0);
  });
});
