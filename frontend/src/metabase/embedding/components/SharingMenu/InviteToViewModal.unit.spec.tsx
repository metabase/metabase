import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { GroupId, GroupInfo, InviteTarget } from "metabase-types/api";
import { createMockGroup, createMockUser } from "metabase-types/api/mocks";

import { InviteToViewModal } from "./InviteToViewModal";

// metabase/common/analytics is auto-mocked globally (frontend/test/__support__/mocks.js),
// so the trackers are jest.fns we can assert on.
const { trackUserInvited, trackInviteToViewOpened } = jest.requireMock(
  "metabase/common/analytics",
);

const ALL_USERS = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const ADMINISTRATORS = createMockGroup({
  id: 2,
  name: "Administrators",
  magic_group_type: "admin",
});
const MARKETING = createMockGroup({
  id: 3,
  name: "Marketing",
  magic_group_type: null,
});
const SALES = createMockGroup({ id: 4, name: "Sales", magic_group_type: null });

const GROUPS: GroupInfo[] = [ALL_USERS, ADMINISTRATORS, MARKETING, SALES];

// By default All Users and Marketing can view the invite target.
const ACCESS_GROUP_IDS: GroupId[] = [ALL_USERS.id, MARKETING.id];

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
  groups?: GroupInfo[];
  accessGroupIds?: GroupId[];
  groupsError?: boolean;
  accessGroupIdsError?: boolean;
  inviteTarget?: InviteTarget;
}

const setup = ({
  title = TITLE,
  emailConfigured = true,
  ssoEnabled = false,
  passwordLoginEnabled = true,
  createError = false,
  groups = GROUPS,
  accessGroupIds = ACCESS_GROUP_IDS,
  groupsError = false,
  accessGroupIdsError = false,
  inviteTarget = INVITE_TARGET,
}: SetupOpts = {}) => {
  const onClose = jest.fn();

  fetchMock.get(
    "path:/api/permissions/group",
    groupsError ? { status: 500 } : groups,
  );
  fetchMock.get(
    "path:/api/permissions/invite-group-ids",
    accessGroupIdsError ? { status: 500 } : accessGroupIds,
  );
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
      inviteTarget={inviteTarget}
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

  describe("group picker access (UXW-4533)", () => {
    it("offers every group, sectioned by access to the item", async () => {
      setup();

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );

      expect(
        await screen.findByRole("option", { name: "All Users" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Administrators" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Marketing" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Sales" })).toBeInTheDocument();

      expect(screen.getByText("Can view this dashboard")).toBeInTheDocument();
      expect(screen.getByText("Other groups")).toBeInTheDocument();
    });

    it("labels the access section for questions", async () => {
      setup({ inviteTarget: { type: "question", id: 7, name: "My question" } });

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );

      expect(
        await screen.findByText("Can view this question"),
      ).toBeInTheDocument();
    });

    it("preselects All Users as a locked membership and leaves the rest to the admin", async () => {
      const { onClose } = setup();

      const pills = within(await screen.findByRole("list"));
      expect(pills.getByText("All Users")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Remove All Users" }),
      ).not.toBeInTheDocument();

      await submitInvite("newbie@metabase.com");
      await waitFor(() => expect(onClose).toHaveBeenCalled());

      // An untouched picker sends no memberships; the backend then defaults to just All Users.
      const body = await getCreateUserRequestBody();
      expect(body.user_group_memberships).toBeUndefined();
    });

    it("sends added groups along with the locked All Users membership", async () => {
      const { onClose } = setup();

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Sales" }),
      );

      await submitInvite("newbie@metabase.com");
      await waitFor(() => expect(onClose).toHaveBeenCalled());

      const body = await getCreateUserRequestBody();
      expect(body.user_group_memberships).toEqual([
        { id: ALL_USERS.id, is_group_manager: false },
        { id: SALES.id, is_group_manager: false },
      ]);
    });

    it("warns when no selected group can view the item, until one is added", async () => {
      setup({ accessGroupIds: [MARKETING.id] });

      expect(
        await screen.findByText(
          "None of the selected groups can view this dashboard, so this person won't be able to see it.",
        ),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
      await userEvent.click(
        await screen.findByRole("option", { name: "Marketing" }),
      );

      expect(
        screen.queryByText(/None of the selected groups/),
      ).not.toBeInTheDocument();
    });

    it("does not warn while a selected group has access", async () => {
      setup();

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(
        screen.queryByText(/None of the selected groups/),
      ).not.toBeInTheDocument();
    });

    it("shows a retryable error instead of the form when the access query fails", async () => {
      setup({ accessGroupIdsError: true });

      expect(
        await screen.findByText("Couldn't load groups. Please try again."),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
    });

    it("shows a retryable error instead of the form when the groups query fails", async () => {
      setup({ groupsError: true });

      expect(
        await screen.findByText("Couldn't load groups. Please try again."),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
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
