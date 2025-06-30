import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { SMTPConnectionCard } from "./SMTPConnectionCard";

const setup = async (props: {
  hosted?: boolean;
  hasCloudCustomSMTPFeature?: boolean;
}) => {
  const emailSettings = {
    "token-features": createMockTokenFeatures({
      hosting: props.hosted,
      "cloud-custom-smtp": props.hasCloudCustomSMTPFeature,
    }),
    "is-hosted?": props.hosted,
  } as const;

  const settings = createMockSettings(emailSettings);

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(
    <div>
      <SMTPConnectionCard />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  if (!props.hosted) {
    await screen.findByTestId("self-hosted-smtp-connection-card");
  } else if (props.hasCloudCustomSMTPFeature) {
    await screen.findByTestId("cloud-smtp-connection-card");
  }
};

describe("SMTPConnectionCard", () => {
  it("should render SelfHostedSMTPConnectionCard if self-hosted", async () => {
    await setup({ hosted: false });
    expect(
      screen.getByTestId("self-hosted-smtp-connection-card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();

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

  it("should render SelfHostedSMTPConnectionCard if self-hosted and feature flag present", async () => {
    await setup({ hosted: false, hasCloudCustomSMTPFeature: true });
    expect(
      screen.getByTestId("self-hosted-smtp-connection-card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });

  it("should render CloudSMTPConnectionCard if hosted and feature flag present", async () => {
    await setup({ hosted: true, hasCloudCustomSMTPFeature: true });
    expect(
      screen.getByTestId("cloud-smtp-connection-card"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("self-hosted-smtp-connection-card"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", {
        name: /Edit settings/i,
      }),
    );
    expect(
      screen.getByTestId("cloud-smtp-connection-form"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Close"));

    expect(
      screen.queryByTestId("cloud-smtp-connection-form"),
    ).not.toBeInTheDocument();
  });

  it("should not render anything hosted and feature flag absent", async () => {
    await setup({ hosted: true, hasCloudCustomSMTPFeature: false });
    expect(
      screen.queryByTestId("self-hosted-smtp-connection-card"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("cloud-smtp-connection-card"),
    ).not.toBeInTheDocument();
  });
});
