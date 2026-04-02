import { render, screen } from "@testing-library/react";

import { PLUGIN_NOTIFICATIONS_SDK } from "embedding-sdk-bundle/components/public/notifications";

import { QuestionAlertsButton } from "./QuestionAlertsButton";

let mockIsGuestEmbed = false;

jest.mock("embedding-sdk-bundle/store", () => ({
  useSdkSelector: () => {
    // The component calls useSdkSelector(getIsGuestEmbed)
    return mockIsGuestEmbed;
  },
}));

describe("QuestionAlertsButton", () => {
  const OriginalPluginComponent = PLUGIN_NOTIFICATIONS_SDK.QuestionAlertsButton;

  beforeEach(() => {
    PLUGIN_NOTIFICATIONS_SDK.QuestionAlertsButton =
      function MockQuestionAlertsButtons() {
        return <button>Plugin Alerts Button</button>;
      };
  });

  afterEach(() => {
    PLUGIN_NOTIFICATIONS_SDK.QuestionAlertsButton = OriginalPluginComponent;
  });

  it("should render the plugin QuestionAlertsButton when not in guest embed mode", () => {
    mockIsGuestEmbed = false;
    render(<QuestionAlertsButton />);

    expect(
      screen.getByRole("button", { name: "Plugin Alerts Button" }),
    ).toBeInTheDocument();
  });

  it("should not render the plugin QuestionAlertsButton in guest embed mode (EMB-1525)", () => {
    mockIsGuestEmbed = true;
    render(<QuestionAlertsButton />);

    expect(
      screen.queryByRole("button", { name: "Plugin Alerts Button" }),
    ).not.toBeInTheDocument();
  });
});
