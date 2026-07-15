import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { InviteGroup, InviteTarget } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { InviteToViewModal } from "./InviteToViewModal";

// metabase/common/analytics is auto-mocked globally (frontend/test/__support__/mocks.js),
// so the trackers are jest.fns we can assert on.
const { trackUserInvited, trackInviteToViewOpened } = jest.requireMock(
  "metabase/common/analytics",
);

const INVITE_GROUPS: InviteGroup[] = [
  { id: 1, name: "All Users", magic_group_type: "all-internal-users" },
  { id: 3, name: "foo", magic_group_type: null },
];

const TITLE = "Invite someone to view this dashboard";

const SHARE_URL = "http://localhost/dashboard/1";

const CREATED_USER = createMockUser({ id: 99, email: "newbie@metabase.com" });

const INVITE_TARGET: InviteTarget = {
  type: "dashboard",
  id: 1,
  name: "My dashboard",
};

interface SetupOpts {
  title?: string;
  emailConfigured?: boolean;
  ssoEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  createError?: boolean;
  inviteGroups?: InviteGroup[];
}

const setup = ({
  title = TITLE,
  emailConfigured = true,
  ssoEnabled = false,
  passwordLoginEnabled = true,
  createError = false,
  inviteGroups = INVITE_GROUPS,
}: SetupOpts = {}) => {
  const onClose = jest.fn();

  fetchMock.get("path:/api/permissions/invite-groups", inviteGroups);
  fetchMock.post(
    "path:/api/user",
    createError
      ? {
          status: 400,
          body: {
            error_code: "email-already-in-use",
            errors: { email: "Email address already in use." },
          },
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
    <InviteToViewModal
      title={title}
      shareUrl={SHARE_URL}
      triggeredFrom="dashboard"
      inviteTarget={INVITE_TARGET}
      onClose={onClose}
    />,
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

const getCreateUserRequestBody = async () => {
  const call = fetchMock.callHistory.calls("path:/api/user", {
    method: "POST",
  })[0];
  // fetch-mock types the captured body as BodyInit, but hands back a promise of the JSON string
  return JSON.parse(await (call.options?.body as unknown as Promise<string>));
};

describe("InviteToViewModal", () => {
  beforeEach(() => {
    trackUserInvited.mockClear();
    trackInviteToViewOpened.mockClear();
  });

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
    expect(screen.getByDisplayValue(SHARE_URL)).toBeInTheDocument();
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
    expect(screen.getByDisplayValue(SHARE_URL)).toBeInTheDocument();
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

  it("sends the invite_target entity in the create-user request", async () => {
    const { onClose } = setup({ emailConfigured: true });

    await submitInvite("newbie@metabase.com");

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const body = await getCreateUserRequestBody();
    expect(body.invite_target).toEqual(INVITE_TARGET);
  });

  describe("group picker scoping (UXW-4533)", () => {
    it("preselects All Users when it has access to the item", async () => {
      const { onClose } = setup();

      expect(
        within(await screen.findByRole("list")).getByText("All Users"),
      ).toBeInTheDocument();

      await submitInvite("newbie@metabase.com");
      await waitFor(() => expect(onClose).toHaveBeenCalled());

      const body = await getCreateUserRequestBody();
      expect(body.user_group_memberships).toEqual([
        { id: 1, is_group_manager: false },
      ]);
    });

    it("preselects the sole candidate when All Users has no access", async () => {
      const { onClose } = setup({
        inviteGroups: [{ id: 3, name: "foo", magic_group_type: null }],
      });

      expect(
        within(await screen.findByRole("list")).getByText("foo"),
      ).toBeInTheDocument();

      await submitInvite("newbie@metabase.com");
      await waitFor(() => expect(onClose).toHaveBeenCalled());

      const body = await getCreateUserRequestBody();
      expect(body.user_group_memberships).toEqual([
        { id: 3, is_group_manager: false },
      ]);
    });

    it("preselects nothing when there are several candidates", async () => {
      const { onClose } = setup({
        inviteGroups: [
          { id: 3, name: "foo", magic_group_type: null },
          { id: 4, name: "bar", magic_group_type: null },
        ],
      });

      const pills = within(await screen.findByRole("list"));
      expect(pills.queryByText("foo")).not.toBeInTheDocument();
      expect(pills.queryByText("bar")).not.toBeInTheDocument();

      await submitInvite("newbie@metabase.com");
      await waitFor(() => expect(onClose).toHaveBeenCalled());

      const body = await getCreateUserRequestBody();
      expect(body.user_group_memberships).toEqual([]);
    });

    it("only offers the groups with access in the picker", async () => {
      setup({
        inviteGroups: [
          { id: 3, name: "foo", magic_group_type: null },
          { id: 4, name: "bar", magic_group_type: null },
        ],
      });

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );

      expect(
        await screen.findByRole("option", { name: "foo" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "bar" })).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "All Users" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "Administrators" }),
      ).not.toBeInTheDocument();
    });
  });

  it("tracks invite_to_view_opened when the modal opens", () => {
    setup();

    expect(trackInviteToViewOpened).toHaveBeenCalledWith({
      triggeredFrom: "dashboard",
      targetId: 1,
    });
    expect(trackInviteToViewOpened).toHaveBeenCalledTimes(1);
  });

  it("tracks user_invited success/new_user on a successful invite", async () => {
    const { onClose } = setup({ emailConfigured: true });

    await submitInvite("newbie@metabase.com");
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(trackUserInvited).toHaveBeenCalledWith({
      triggeredFrom: "dashboard",
      targetId: 1,
      result: "success",
      eventDetail: "new_user",
    });
    expect(trackUserInvited).toHaveBeenCalledTimes(1);
  });

  it("tracks user_invited failure/existing_user when the email is already in use", async () => {
    setup({ createError: true });

    await submitInvite("taken@metabase.com");
    await screen.findByText("Email address already in use.");

    expect(trackUserInvited).toHaveBeenCalledWith({
      triggeredFrom: "dashboard",
      targetId: 1,
      result: "failure",
      eventDetail: "existing_user",
    });
    expect(trackUserInvited).toHaveBeenCalledTimes(1);
  });

  it("never sends the invitee email to analytics", async () => {
    const { onClose } = setup({ emailConfigured: true });

    await submitInvite("newbie@metabase.com");
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    expect(JSON.stringify(trackUserInvited.mock.calls)).not.toContain(
      "newbie@metabase.com",
    );
  });
});
