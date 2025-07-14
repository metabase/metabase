import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { EmailFromAddressWidget } from "./EmailFromAddressWidget";

const setup = async (props: {
  cloudCustomSMTPFF?: boolean;
  cloudSMTPEnabled?: boolean;
  hosted?: boolean;
  selfHostedFromAddress?: string;
  cloudCustomFromAddress?: string;
  smtpHost?: string;
}) => {
  const emailSettings = {
    "email-from-address": props.selfHostedFromAddress || "env@metabase.com",
    "email-from-address-override": props.cloudCustomFromAddress,
    "token-features": createMockTokenFeatures({
      hosting: !!props.hosted,
      cloud_custom_smtp: props.cloudCustomSMTPFF,
    }),
    "email-smtp-host-override": props.smtpHost,
    "smtp-override-enabled": props.cloudSMTPEnabled,
    "is-hosted?": !!props.hosted,
  } as const;

  const settings = createMockSettings(emailSettings);

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      // auto set the value to mimic a managed cloud instance
      key: "email-from-address",
      value: props.selfHostedFromAddress || "env@metabase.com",
      description: "Email from address description",
      is_env_setting:
        !props.cloudCustomFromAddress && !props.selfHostedFromAddress,
    }),
    createMockSettingDefinition({
      key: "email-from-address-override",
      value: props.cloudCustomFromAddress,
      description: "Cloud email from address description",
    }),
    createMockSettingDefinition({ key: "is-hosted?", value: props.hosted }),
    createMockSettingDefinition({
      key: "smtp-override-enabled",
      value: props.cloudSMTPEnabled,
    }),
    createMockSettingDefinition({
      key: "email-smtp-host-override",
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
        currentUser: createMockUser({ is_superuser: true }),
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
    });
    const input = await screen.findByDisplayValue("env@metabase.com");
    expect(input).toBeDisabled();
    expect(
      screen.getByText(
        "Please set up a custom SMTP server to change this (Pro only)",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Whitelabel email notifications"),
    ).toBeInTheDocument();
  });

  it("should be disabled for cloud users with feature flag who haven't configured smtp", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: true,
      smtpHost: undefined,
    });
    const input = await screen.findByDisplayValue("env@metabase.com");
    expect(input).toBeDisabled();
    expect(
      screen.getByText("Please set up a custom SMTP server to change this"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Whitelabel email notifications"),
    ).not.toBeInTheDocument();
  });

  it("should be disabled for cloud users with feature flag who have configured smtp but not enabled it", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: true,
      smtpHost: "smtp.grovyle.com",
      cloudSMTPEnabled: false,
    });
    const input = await screen.findByDisplayValue("env@metabase.com");
    expect(input).toBeDisabled();
    expect(
      screen.getByText("Please set up a custom SMTP server to change this"),
    ).toBeInTheDocument();
  });

  it("should be editable for cloud users with feature flag who have configured and enabled smtp", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPFF: true,
      cloudCustomFromAddress: "cloudcustom@test.com",
      smtpHost: "smtp.grovyle.com",
      cloudSMTPEnabled: true,
    });

    expect(
      screen.getByText("Cloud email from address description"),
    ).toBeInTheDocument();

    const blur = async () => {
      const elementOutside = screen.getByText(
        "Cloud email from address description",
      );
      await userEvent.click(elementOutside); // blur
    };

    const fromAddressInput = await screen.findByDisplayValue(
      "cloudcustom@test.com",
    );
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

    expect(putUrl).toContain("/api/setting/email-from-address-override");
    expect(putBody).toEqual({ value: "grovyle@brock.com" });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(1);
    });
  });

  it("should be enabled for self-hosted users", async () => {
    await setup({
      hosted: false,
      selfHostedFromAddress: "selfhosted@test.com",
    });

    expect(
      screen.queryByText("Whitelabel email notifications"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByText("Email from address description"),
    ).toBeInTheDocument();

    const blur = async () => {
      const elementOutside = screen.getByText("Email from address description");
      await userEvent.click(elementOutside); // blur
    };

    const fromAddressInput = await screen.findByDisplayValue(
      "selfhosted@test.com",
    );
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
