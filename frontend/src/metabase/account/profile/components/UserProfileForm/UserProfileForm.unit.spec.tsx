import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupUpdateSettingEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockUser,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

import type { UserProfileFormProps } from "./UserProfileForm";
import UserProfileForm from "./UserProfileForm";

const setup = (
  props: UserProfileFormProps,
  {
    hasMetabotAccess = true,
    metabotUserCustomInstructions = null,
  }: {
    hasMetabotAccess?: boolean;
    metabotUserCustomInstructions?: string | null;
  } = {},
) => {
  const settings = createMockSettings({
    "metabot-user-custom-instructions": metabotUserCustomInstructions,
  });
  const state = createMockState({
    settings: mockSettings(settings),
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions({
      metabot: hasMetabotAccess ? "yes" : "no",
    }),
  );

  renderWithProviders(<UserProfileForm {...props} />, {
    storeInitialState: state,
  });
};

describe("UserProfileForm", () => {
  it("should show a success message after form submit", async () => {
    const props = getProps({
      onSubmit: jest.fn().mockResolvedValue({}),
    });

    setup(props);

    await userEvent.clear(screen.getByLabelText("First name"));
    await userEvent.type(screen.getByLabelText("First name"), "New name");
    await userEvent.click(screen.getByText("Update"));

    expect(await screen.findByText("Success")).toBeInTheDocument();
  });

  it("should show the Metabot instructions field when the user has Metabot access", async () => {
    setup(getProps(), { hasMetabotAccess: true });

    expect(await screen.findByText("Metabot instructions")).toBeInTheDocument();
  });

  it("should not show the Metabot instructions field when the user lacks Metabot access", async () => {
    setup(getProps(), { hasMetabotAccess: false });

    await waitFor(() =>
      expect(fetchMock.callHistory.calls().length).toBeGreaterThan(0),
    );

    expect(screen.queryByText("Metabot instructions")).not.toBeInTheDocument();
  });

  it("should save the Metabot instructions field on change", async () => {
    setup(getProps());

    const textarea = await screen.findByPlaceholderText(
      "E.g. I usually ask about sales and marketing data, not engineering metrics.",
    );
    await userEvent.type(textarea, "Focus on marketing data.");

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls(
        "path:/api/setting/metabot-user-custom-instructions",
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it("should populate the Metabot instructions field with a pre-existing value", async () => {
    setup(getProps(), {
      metabotUserCustomInstructions: "Focus on marketing data.",
    });

    expect(
      await screen.findByDisplayValue("Focus on marketing data."),
    ).toBeInTheDocument();
  });
});

const getProps = (
  opts?: Partial<UserProfileFormProps>,
): UserProfileFormProps => ({
  user: createMockUser(),
  locales: null,
  isSsoUser: false,
  onSubmit: jest.fn(),
  ...opts,
});
