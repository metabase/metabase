import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupEmailEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { SendTestEmailWidget } from "./SendTestEmailWidget";

const setup = async (props: {
  hosted?: boolean;
  emailConfigured?: boolean;
}) => {
  const emailSettings = {
    "token-features": createMockTokenFeatures({
      hosting: props.hosted,
    }),
    "is-hosted?": props.hosted,
    "email-configured?": props.emailConfigured,
  } as const;

  const settings = createMockSettings(emailSettings);

  setupEmailEndpoints();
  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(
    <div>
      <SendTestEmailWidget />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  if (props.hosted || props.emailConfigured) {
    await screen.findByRole("button", { name: "Send test email" });
  }
};

describe("SendTestEmailWidget", () => {
  it("should send a test email", async () => {
    await setup({ emailConfigured: true });

    await userEvent.click(
      screen.getByRole("button", { name: "Send test email" }),
    );
    const posts = await findRequests("POST");
    const { url } = posts[0];

    expect(url).toContain("/api/email/test");

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(1);
    });
  });

  it("should show an error message if the test email errors", async () => {
    await setup({ emailConfigured: true });

    fetchMock.modifyRoute("email-test", { response: 400 });

    await userEvent.click(
      screen.getByRole("button", { name: "Send test email" }),
    );

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("warning icon");
      expect(toasts).toHaveLength(1);
    });

    expect(
      screen.getByRole("alert", { name: "Error sending test email" }),
    ).toBeInTheDocument();
  });
});
