import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { SelfHostedSMTPConnectionCard } from "./SelfHostedSMTPConnectionCard";

const setup = async (props: { emailEnabled?: boolean }) => {
  const settings = createMockSettings({
    "email-configured?": props.emailEnabled,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

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

describe("SelfHostedSMTPConnectionCard", () => {
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
});
