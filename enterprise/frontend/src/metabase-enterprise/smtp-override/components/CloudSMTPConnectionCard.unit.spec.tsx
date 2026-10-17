import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupEmailOverrideEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { CloudSMTPConnectionCard } from "./CloudSMTPConnectionCard";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
// Reached via requireMock because the lint rule forbids importing it here.
const { trackSimpleEvent: mockTrackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

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
  setupEmailOverrideEndpoints();
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
  beforeEach(() => {
    mockTrackSimpleEvent.mockClear();
  });

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

  it("should track the setup click and a successful save, then show the custom server as enabled", async () => {
    await setup({
      hosted: true,
      cloudCustomSMTPConfigured: false,
      cloudSMTPEnabled: false,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Set up a custom SMTP server" }),
    );

    expect(mockTrackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSimpleEvent).toHaveBeenCalledWith({
      event: "custom_smtp_setup_clicked",
      event_detail: "cloud",
    });

    const form = screen.getByTestId("smtp-override-connection-form");
    await userEvent.type(
      within(form).getByLabelText(/SMTP Host/i),
      "localhost",
    );
    await userEvent.type(
      within(form).getByLabelText(/SMTP Username/i),
      "admin",
    );
    await userEvent.type(
      within(form).getByLabelText(/SMTP Password/i),
      "admin",
    );

    setupPropertiesEndpoints(
      createMockSettings({
        "email-smtp-host-override": "localhost",
        "smtp-override-enabled": true,
      }),
    );
    await userEvent.click(
      within(form).getByRole("button", { name: "Save changes" }),
    );

    const card = screen.getByTestId("cloud-smtp-connection-card");
    expect(
      await within(card).findByRole("button", { name: "Edit settings" }),
    ).toBeInTheDocument();
    expect(within(card).getByLabelText("Custom SMTP Server")).toBeChecked();
    expect(mockTrackSimpleEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackSimpleEvent).toHaveBeenLastCalledWith({
      event: "custom_smtp_setup_success",
      event_detail: "cloud",
    });
  });
});
