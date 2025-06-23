import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { EmailFromAddressWidget } from "./EmailFromAddressWidget";

const setup = async (props: {
  cloudCustomSMTPFF?: boolean;
  cloudSMTPEnabled?: boolean;
  hosted?: boolean;
  fromAddress?: string;
  smtpHost?: string;
}) => {
  const emailSettings = {
    "email-from-address": props.fromAddress,
    "token-features": createMockTokenFeatures({
      hosting: !!props.hosted,
      "cloud-custom-smtp": props.cloudCustomSMTPFF,
    }),
    "cloud-email-smtp-host": props.smtpHost,
    "cloud-smtp-enabled": props.cloudSMTPEnabled,
    "is-hosted?": !!props.hosted,
  } as const;

  const settings = createMockSettings(emailSettings);

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "email-from-address",
      value: props.fromAddress,
      description: "Email from address description",
    }),
    createMockSettingDefinition({ key: "is-hosted?", value: props.hosted }),
    createMockSettingDefinition({
      key: "cloud-smtp-enabled",
      value: props.cloudSMTPEnabled,
    }),
    createMockSettingDefinition({
      key: "cloud-email-smtp-host",
      value: props.smtpHost,
    }),
  ]);

  renderWithProviders(
    <div>
      <EmailFromAddressWidget />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  await screen.findByLabelText(/From Address/i);
};

describe("EmailFromAddressWidgets", () => {
  it("should be disabled for cloud users who don't have feature flag", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: false,
      fromAddress: "noreply@metabase.com",
    });
    const input = await screen.findByDisplayValue("noreply@metabase.com");
    expect(input).toBeDisabled();
    expect(
      screen.getByText(
        "Please set up a custom SMTP server to change this (Pro only)",
      ),
    ).toBeInTheDocument();
  });

  it("should be disabled for cloud users with feature flag who haven't configured smtp", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: true,
      fromAddress: "noreply@metabase.com",
      smtpHost: undefined,
    });
    const input = await screen.findByDisplayValue("noreply@metabase.com");
    expect(input).toBeDisabled();
    expect(
      screen.getByText("Please set up a custom SMTP server to change this"),
    ).toBeInTheDocument();
  });

  it("should be disabled for cloud users with feature flag who have configured smtp but not enabled it", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: true,
      fromAddress: "noreply@metabase.com",
      smtpHost: "smtp.grovyle.com",
      cloudSMTPEnabled: false,
    });
    const input = await screen.findByDisplayValue("noreply@metabase.com");
    expect(input).toBeDisabled();
    expect(
      screen.getByText("Please set up a custom SMTP server to change this"),
    ).toBeInTheDocument();
  });

  it("should be enabled for cloud users with feature flag who have configured and enabled smtp", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: true,
      fromAddress: "noreply@metabase.com",
      smtpHost: "smtp.grovyle.com",
      cloudSMTPEnabled: true,
    });
    const input = await screen.findByDisplayValue("noreply@metabase.com");
    expect(input).toBeEnabled();
    expect(
      screen.getByText("Email from address description"),
    ).toBeInTheDocument();
  });

  it("should be enabled for self-hosted users", async () => {
    await setup({
      hosted: false,
      fromAddress: "custom@test.com",
    });
    const input = await screen.findByDisplayValue("custom@test.com");
    expect(input).toBeDisabled();
  });

  it("should update multiple settings", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: true,
      smtpHost: "smtp.grovyle.com",
      cloudSMTPEnabled: true,
      fromAddress: "treeko@ash.com",
    });

    const blur = async () => {
      const elementOutside = screen.getByText("Email from address description");
      await userEvent.click(elementOutside); // blur
    };

    const fromAddressInput = await screen.findByDisplayValue("treeko@ash.com");
    await userEvent.clear(fromAddressInput);
    await userEvent.type(fromAddressInput, "grovyle@brock.com");
    await blur();
    await screen.findByDisplayValue("grovyle@brock.com");

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    const { url: putUrl, body: putBody } = puts[0];

    expect(putUrl).toContain("/api/setting/email-from-address");
    expect(putBody).toEqual({ value: "grovyle@brock.com" });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(1);
    });
  });
});
