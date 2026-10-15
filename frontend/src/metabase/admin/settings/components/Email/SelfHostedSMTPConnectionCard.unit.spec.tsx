import userEvent from "@testing-library/user-event";

import {
  setupEmailEndpoints,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockSettings } from "metabase-types/api/mocks";

import { SelfHostedSMTPConnectionCard } from "./SelfHostedSMTPConnectionCard";

// `metabase/analytics` is auto-mocked for every test (see `__support__/mocks`).
// Reached via requireMock because the lint rule forbids importing it here.
const { trackSimpleEvent: mockTrackSimpleEvent } = jest.requireMock<{
  trackSimpleEvent: jest.Mock;
}>("metabase/analytics");

interface SetupOpts {
  emailEnabled?: boolean;
}

const setup = async ({ emailEnabled }: SetupOpts = {}) => {
  const settings = createMockSettings({
    "email-configured?": emailEnabled,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupEmailEndpoints();

  renderWithProviders(
    <div>
      <SelfHostedSMTPConnectionCard />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  await screen.findByText(/Self-Hosted SMTP/i);
};

const getCard = () => screen.getByTestId("self-hosted-smtp-connection-card");

describe("SelfHostedSMTPConnectionCard", () => {
  beforeEach(() => {
    mockTrackSimpleEvent.mockClear();
  });

  it("should render", async () => {
    await setup({});

    expect(
      await screen.findByRole("button", {
        name: /Configure/i,
      }),
    ).toBeInTheDocument();
  });

  it("should change text when email is enabled", async () => {
    await setup({
      emailEnabled: true,
    });

    expect(
      await screen.findByRole("button", {
        name: /Edit configuration/i,
      }),
    ).toBeInTheDocument();
  });

  it("should show the Active badge when email is configured", async () => {
    await setup({ emailEnabled: true });

    expect(within(getCard()).getByText("Active")).toBeInTheDocument();
  });

  it("should not show the Active badge when email is not configured", async () => {
    await setup({ emailEnabled: false });

    expect(within(getCard()).queryByText("Active")).not.toBeInTheDocument();
  });

  it("should open self-hosted connection modal", async () => {
    await setup({});
    await userEvent.click(
      screen.getByRole("button", {
        name: /Configure/i,
      }),
    );
    expect(
      screen.getByTestId("self-hosted-smtp-connection-form"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Close"));

    expect(
      screen.queryByTestId("self-hosted-smtp-connection-form"),
    ).not.toBeInTheDocument();
  });

  it("should track the setup click and a successful save, then show the card as active", async () => {
    await setup({ emailEnabled: false });

    await userEvent.click(
      within(getCard()).getByRole("button", { name: "Configure" }),
    );

    expect(mockTrackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackSimpleEvent).toHaveBeenCalledWith({
      event: "custom_smtp_setup_clicked",
      event_detail: "self-hosted",
    });

    const form = screen.getByTestId("self-hosted-smtp-connection-form");
    await userEvent.type(
      within(form).getByLabelText(/SMTP Host/i),
      "localhost",
    );
    await userEvent.type(within(form).getByLabelText(/SMTP Port/i), "1025");
    await userEvent.type(
      within(form).getByLabelText(/SMTP Username/i),
      "admin",
    );
    await userEvent.type(
      within(form).getByLabelText(/SMTP Password/i),
      "admin",
    );

    setupPropertiesEndpoints(createMockSettings({ "email-configured?": true }));
    await userEvent.click(
      within(form).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await within(getCard()).findByRole("button", {
        name: "Edit configuration",
      }),
    ).toBeInTheDocument();
    expect(within(getCard()).getByText("Active")).toBeInTheDocument();
    expect(mockTrackSimpleEvent).toHaveBeenCalledTimes(2);
    expect(mockTrackSimpleEvent).toHaveBeenLastCalledWith({
      event: "custom_smtp_setup_success",
      event_detail: "self-hosted",
    });
  });
});
