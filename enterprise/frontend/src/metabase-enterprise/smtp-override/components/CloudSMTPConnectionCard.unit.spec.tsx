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
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { CloudSMTPConnectionCard } from "./CloudSMTPConnectionCard";

const setup = async (props: {
  cloudCustomSMTPFF?: boolean;
  cloudSMTPEnabled?: boolean;
  hosted?: boolean;
  cloudCustomSMTPConfigured?: boolean;
}) => {
  const emailSettings = {
    "email-smtp-host-override": props.cloudCustomSMTPConfigured
      ? "host@test.com"
      : undefined,
    "token-features": createMockTokenFeatures({
      hosting: !!props.hosted,
      cloud_custom_smtp: props.cloudCustomSMTPFF,
    }),
    "smtp-override-enabled": props.cloudSMTPEnabled,
    "is-hosted?": !!props.hosted,
  } as const;

  const settings = createMockSettings(emailSettings);

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({ key: "is-hosted?", value: props.hosted }),
    createMockSettingDefinition({
      key: "smtp-override-enabled",
      value: props.cloudSMTPEnabled,
    }),
    createMockSettingDefinition({
      key: "email-smtp-host-override",
      value: props.cloudCustomSMTPConfigured ? "host@test.com" : undefined,
    }),
  ]);

  renderWithProviders(
    <div>
      <CloudSMTPConnectionCard />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  await screen.findByText(/Managed by Metabase/i);
};

describe("CloudSMTPConnectionCard", () => {
  it("should be Managed by Metabase if no custom smtp config", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPConfigured: false,
    });

    expect(
      await screen.findByRole("button", {
        name: /Set up a custom SMTP server/i,
      }),
    ).toBeInTheDocument();

    const metabaseManagedTick = screen.getAllByLabelText("check icon");
    expect(metabaseManagedTick).toHaveLength(1);
  });

  it("should be present radio options when custom smtp config is configured", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPConfigured: true,
    });

    expect(screen.getByText(/Custom smtp server/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Emails come from your email server/i),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", {
        name: /Edit settings/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: /Set up a custom SMTP server/i,
      }),
    ).not.toBeInTheDocument();

    const metabaseManagedTick = screen.queryAllByLabelText("check icon");
    expect(metabaseManagedTick).toHaveLength(0);

    await userEvent.click(screen.getByText(/Custom smtp server/i));

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    const { url: putUrl, body: putBody } = puts[0];

    expect(putUrl).toContain("/api/setting/smtp-override-enabled");
    expect(putBody).toEqual({ value: true });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(1);
    });
  });

  it("should open override connection form modal", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPConfigured: true,
    });
    await userEvent.click(
      screen.getByRole("button", {
        name: /Edit settings/i,
      }),
    );
    expect(
      screen.getByTestId("smtp-override-connection-form"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Close"));

    expect(
      screen.queryByTestId("smtp-override-connection-form"),
    ).not.toBeInTheDocument();
  });
});
