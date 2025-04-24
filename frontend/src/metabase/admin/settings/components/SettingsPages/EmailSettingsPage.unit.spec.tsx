import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { act } from "react-dom/test-utils";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import type { SettingKey } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { EmailSettingsPage } from "./EmailSettingsPage";

const setup = async (props: { disablePremiumFeatures?: boolean }) => {
  const emailSettings = {
    "email-from-name": "Metatest",
    "email-from-address": "replies@metatest.com",
    "token-features": createMockTokenFeatures({
      email_allow_list: !props.disablePremiumFeatures,
      email_restrict_recipients: !props.disablePremiumFeatures,
    }),
  } as const;

  const settings = createMockSettings(emailSettings);

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints(
    Object.entries(settings).map(([key, value]) =>
      createMockSettingDefinition({ key: key as SettingKey, value }),
    ),
  );

  renderWithProviders(
    <div>
      <EmailSettingsPage />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );
};

describe("EmailSettingsPage", () => {
  it("should render an EmailSettingsPage", async () => {
    await act(() => setup({}));
    [
      "From Name",
      "From Address",
      "Reply-To Address",
      "Add Recipients as CC or BCC",
      "Approved domains for notifications",
      "Suggest recipients on dashboard subscriptions and alerts",
    ].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
  });

  it("should not render premium features missing from token", async () => {
    await act(() =>
      setup({
        disablePremiumFeatures: true,
      }),
    );
    [
      "Approved domains for notifications",
      "Suggest recipients on dashboard subscriptions and alerts",
    ].forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
  });

  it("should update multiple settings", async () => {
    setup({});

    const blur = async () => {
      const elementOutside = screen.getByText("Add Recipients as CC or BCC");
      await userEvent.click(elementOutside); // blur
    };

    const nameInput = await screen.findByDisplayValue("Metatest");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Meta Best");
    blur();
    await screen.findByDisplayValue("Meta Best");

    const emailInput = await screen.findByDisplayValue("replies@metatest.com");
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, "support@metatest.com");
    blur();
    await screen.findByDisplayValue("support@metatest.com");

    await waitFor(async () => {
      const puts = await findPuts();
      expect(puts).toHaveLength(2);
    });

    const puts = await findPuts();
    const [namePutUrl, namePutDetails] = puts[0];
    const [emailPutUrl, emailPutDetails] = puts[1];

    expect(namePutUrl).toContain("/api/setting/email-from-name");
    expect(namePutDetails).toEqual({ value: "Meta Best" });

    expect(emailPutUrl).toContain("/api/setting/email-from-address");
    expect(emailPutDetails).toEqual({ value: "support@metatest.com" });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check icon");
      expect(toasts).toHaveLength(2);
    });
  });
});

async function findPuts() {
  const calls = fetchMock.calls();
  const data = calls.filter((call) => call[1]?.method === "PUT") ?? [];

  const puts = data.map(async ([putUrl, putDetails]) => {
    const body = ((await putDetails?.body) as string) ?? "{}";

    return [putUrl, JSON.parse(body ?? "{}")];
  });

  return Promise.all(puts);
}
