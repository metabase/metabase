import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockGroup, createMockUser } from "metabase-types/api/mocks";

import { InviteToViewModal } from "./InviteToViewModal";

const GROUPS = [
  createMockGroup({ id: 1, magic_group_type: "all-internal-users" }),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "foo", magic_group_type: null }),
];

const TITLE = "Invite someone to view this dashboard";

const CREATED_USER = createMockUser({ id: 99, email: "newbie@metabase.com" });

interface SetupOpts {
  title?: string;
  emailConfigured?: boolean;
  ssoEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  createError?: boolean;
}

const setup = ({
  title = TITLE,
  emailConfigured = true,
  ssoEnabled = false,
  passwordLoginEnabled = true,
  createError = false,
}: SetupOpts = {}) => {
  const onClose = jest.fn();

  fetchMock.get("path:/api/permissions/group", GROUPS);
  fetchMock.post(
    "path:/api/user",
    createError
      ? {
          status: 400,
          body: { errors: { email: "Email address already in use." } },
        }
      : CREATED_USER,
  );

  const state = createMockState({
    settings: mockSettings({
      "email-configured?": emailConfigured,
      "enable-password-login": passwordLoginEnabled,
      "saml-enabled": ssoEnabled,
    }),
  });

  const { store } = renderWithProviders(
    <InviteToViewModal title={title} onClose={onClose} />,
    { storeInitialState: state },
  );

  return { onClose, store };
};

const submitInvite = async (email: string) => {
  await userEvent.type(await screen.findByLabelText(/Email/), email);
  await userEvent.click(
    screen.getByRole("button", { name: "Send invitation" }),
  );
};

describe("InviteToViewModal", () => {
  it("renders the provided title", async () => {
    setup({ title: "Invite someone to view this question" });

    expect(
      await screen.findByText("Invite someone to view this question"),
    ).toBeInTheDocument();
  });

  it("hides the name fields whenever SSO is enabled, including mixed mode", async () => {
    setup({ ssoEnabled: true, passwordLoginEnabled: true });

    expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Last name")).not.toBeInTheDocument();
  });

  it("creates the user, shows a confirmation toast, and closes when email is configured", async () => {
    const { onClose, store } = setup({ emailConfigured: true });

    await submitInvite("newbie@metabase.com");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(store.getState().undo).toEqual([
      expect.objectContaining({ message: "Invitation sent" }),
    ]);
  });

  it("shows a temporary password instead of a toast when email is not configured", async () => {
    const { onClose } = setup({
      emailConfigured: false,
      passwordLoginEnabled: true,
    });

    await submitInvite("newbie@metabase.com");

    expect(await screen.findByText("Temporary password")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still shows a temporary password (not the email-setup prompt) in mixed SSO + password mode", async () => {
    setup({
      emailConfigured: false,
      ssoEnabled: true,
      passwordLoginEnabled: true,
    });

    await submitInvite("newbie@metabase.com");

    expect(await screen.findByText("Temporary password")).toBeInTheDocument();
    expect(screen.queryByText("Set up email")).not.toBeInTheDocument();
  });

  it("prompts to set up email on SSO-only instances without email configured", async () => {
    setup({
      emailConfigured: false,
      ssoEnabled: true,
      passwordLoginEnabled: false,
    });

    expect(await screen.findByText("Set up email")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
  });

  it("surfaces an inline error and stays open when the email is already in use", async () => {
    const { onClose } = setup({ createError: true });

    await submitInvite("taken@metabase.com");

    expect(
      await screen.findByText("Email address already in use."),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
