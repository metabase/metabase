import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGroupsEndpoint,
  setupTenantEntpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createReadyMessage,
  createTokenMessage,
} from "metabase/embedding/permission-preview/messages";
import type { Group, User } from "metabase-types/api";
import {
  createMockCard,
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { createAnswer } from "./ExplainAccess/fixtures";
import { PreviewAccessPage } from "./PreviewAccessPage";

const SESSION_URL = "path:/api/ee/permission_debug/preview/session";

const USERS = [
  createMockUser({
    id: 2,
    common_name: "Sandy Sales",
    email: "sandy@example.com",
  }),
  createMockUser({
    id: 3,
    common_name: "Tina Tenant",
    email: "tina@acme.example",
    tenant_id: 8,
  }),
  createMockUser({
    id: 4,
    common_name: "Ada Admin",
    email: "ada@example.com",
    is_superuser: true,
  }),
  createMockUser({
    id: 5,
    common_name: "Gone Person",
    email: "gone@example.com",
    is_active: false,
  }),
];

const GROUPS: Omit<Group, "members">[] = [
  { id: 1, name: "All Users", magic_group_type: "all-internal-users" },
  { id: 2, name: "Administrators", magic_group_type: "admin" },
  { id: 3, name: "All tenant users", magic_group_type: "all-external-users" },
  {
    id: 9,
    name: "Sales",
    magic_group_type: null,
    member_count: 1,
  },
  {
    id: 10,
    name: "Acme analysts",
    magic_group_type: null,
    is_tenant_group: true,
    member_count: 3,
  },
];

interface SetupOpts {
  users?: User[];
  refusal?: { status: number; body: object };
}

function setup({ users = USERS, refusal }: SetupOpts = {}) {
  setupUsersEndpoints(users);
  setupGroupsEndpoint(GROUPS);
  setupTenantEntpoints([createMockTenant({ id: 8, name: "Acme" })]);

  let previewCount = 0;
  fetchMock.post(SESSION_URL, (call) => {
    if (refusal) {
      return refusal;
    }
    previewCount += 1;
    const body = JSON.parse(String(call.options.body));
    return {
      id: previewCount,
      token: `mbpv_token-${previewCount}`,
      expires_at: "2026-11-24T12:00:00Z",
      // a group preview runs as its stand-in, which has a user of its own
      user_id: body.user_id ?? 100 + body.group_id,
    };
  });
  fetchMock.get(
    "path:/api/card/12",
    createMockCard({ id: 12, name: "Orders by state" }),
  );
  fetchMock.get("path:/api/ee/permission_debug", createAnswer());
  fetchMock.delete("express:/api/ee/permission_debug/preview/session/:id", 204);

  renderWithProviders(<PreviewAccessPage />, {
    storeInitialState: createMockState({
      settings: mockSettings({
        "token-features": createMockTokenFeatures({
          advanced_permissions: true,
        }),
      }),
      currentUser: createMockUser({ is_superuser: true }),
    }),
  });
}

async function getFrame() {
  const frame = await screen.findByTitle(/^Preview of /);

  if (!(frame instanceof HTMLIFrameElement)) {
    throw new Error("the preview is not in an iframe");
  }
  return frame;
}

function debuggedUserIds() {
  return fetchMock.callHistory
    .calls("path:/api/ee/permission_debug")
    .map((call) => new URL(call.url).searchParams.get("user_id"));
}

async function openExplainAccessOnQuestion() {
  const linkBox = await screen.findByLabelText("Link or ID");
  await userEvent.clear(linkBox);
  await userEvent.type(linkBox, "/question/12{Enter}");
  await userEvent.click(screen.getByRole("button", { name: /Explain access/ }));
}

function startedBodies() {
  return fetchMock.callHistory
    .calls(SESSION_URL, { method: "POST" })
    .map((call) => call.options.body);
}

describe("PreviewAccessPage", () => {
  it("asks for a pick before anything runs", async () => {
    setup();

    expect(
      await screen.findByText(
        "Select a user or group to see what they can open.",
      ),
    ).toBeInTheDocument();
    expect(startedBodies()).toEqual([]);
  });

  it("lists internal and tenant users, never admins or deactivated users", async () => {
    setup();

    expect(await screen.findByText("Internal users")).toBeInTheDocument();
    expect(screen.getByText("Tenant users")).toBeInTheDocument();
    expect(screen.getByText("Sandy Sales")).toBeInTheDocument();
    expect(screen.getByText("Acme · tina@acme.example")).toBeInTheDocument();
    expect(screen.queryByText("Ada Admin")).not.toBeInTheDocument();
    expect(screen.queryByText("Gone Person")).not.toBeInTheDocument();
  });

  it("asks for every user, tenant users included", async () => {
    setup();
    await screen.findByText("Sandy Sales");

    const userCall = fetchMock.callHistory.lastCall("path:/api/user");
    expect(userCall?.url).toContain("tenancy=all");
  });

  it("previews a picked user in a frame at All collections", async () => {
    setup();

    await userEvent.click(await screen.findByText("Sandy Sales"));

    expect(await screen.findByText("Previewing as Sandy Sales")).toBeVisible();
    expect(screen.getByText("Read-only")).toBeVisible();
    expect(await getFrame()).toHaveAttribute(
      "src",
      "/embed/permission-preview-content/collection/all",
    );
    expect(startedBodies()).toEqual([JSON.stringify({ user_id: 2 })]);
  });

  it("lists groups without Administrators and All tenant users, and previews a picked one", async () => {
    setup();
    await screen.findByText("Sandy Sales");

    await userEvent.click(screen.getByText("Group"));

    expect(
      await screen.findByText("Previews a stand-in member, not a real user."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Internal groups")).toBeInTheDocument();
    expect(screen.getByText("Tenant groups")).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
    expect(screen.getByText("1 member")).toBeInTheDocument();
    expect(screen.queryByText("Administrators")).not.toBeInTheDocument();
    expect(screen.queryByText("All tenant users")).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("Acme analysts"));

    expect(
      await screen.findByText("Previewing as a member of Acme analysts"),
    ).toBeVisible();
    expect(startedBodies()).toEqual([JSON.stringify({ group_id: 10 })]);
  });

  it("says why a start was refused", async () => {
    setup({
      refusal: {
        status: 400,
        body: {
          message: "Admins can't be previewed.",
          "error-code": "preview-target-admin",
        },
      },
    });

    await userEvent.click(await screen.findByText("Sandy Sales"));

    expect(
      await screen.findByText(
        "Admins can't be previewed, because they can see everything.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTitle(/^Preview of /)).not.toBeInTheDocument();
  });

  it("ends the preview of the person it replaces", async () => {
    setup();

    await userEvent.click(await screen.findByText("Sandy Sales"));
    await getFrame();
    await userEvent.click(screen.getByText("Tina Tenant"));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(
          "path:/api/ee/permission_debug/preview/session/1",
          { method: "DELETE" },
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Previewing as Tina Tenant")).toBeVisible();
  });

  it("opens a pasted link in the frame", async () => {
    setup();
    await userEvent.click(await screen.findByText("Sandy Sales"));
    await getFrame();

    const linkBox = screen.getByLabelText("Link or ID");
    await userEvent.clear(linkBox);
    await userEvent.type(
      linkBox,
      "http://localhost:3000/dashboard/12-sales-overview{Enter}",
    );

    await waitFor(async () =>
      expect(await getFrame()).toHaveAttribute(
        "src",
        "/embed/permission-preview-content/dashboard/12",
      ),
    );
    expect(linkBox).toHaveValue(
      "http://localhost:3000/dashboard/12-sales-overview",
    );
  });

  describe("the person's token", () => {
    function sendFromWindow(source: MessageEventSource | null, origin: string) {
      act(() => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: createReadyMessage(),
            origin,
            source,
          }),
        );
      });
    }

    it("goes to the frame that asks for it, at this origin", async () => {
      setup();
      await userEvent.click(await screen.findByText("Sandy Sales"));
      const frame = await getFrame();
      const postMessage = jest.fn();
      frame.contentWindow!.postMessage = postMessage;

      sendFromWindow(frame.contentWindow, window.location.origin);

      expect(postMessage).toHaveBeenCalledWith(
        createTokenMessage("mbpv_token-1"),
        window.location.origin,
      );
    });

    it("stays with the page when another window or origin asks", async () => {
      setup();
      await userEvent.click(await screen.findByText("Sandy Sales"));
      const frame = await getFrame();
      const postMessage = jest.fn();
      frame.contentWindow!.postMessage = postMessage;

      sendFromWindow(window, window.location.origin);
      sendFromWindow(frame.contentWindow, "https://evil.example");

      expect(postMessage).not.toHaveBeenCalled();
    });
  });

  it("starts the link box at All collections", async () => {
    setup();
    await userEvent.click(await screen.findByText("Sandy Sales"));
    await getFrame();

    expect(screen.getByLabelText("Link or ID")).toHaveValue("/collection/all");
  });

  it("explains the access to the item the frame shows, as the user the preview runs as", async () => {
    setup();
    await userEvent.click(await screen.findByText("Sandy Sales"));

    await openExplainAccessOnQuestion();

    expect(
      await screen.findByText("Access to “Orders by state”"),
    ).toBeInTheDocument();
    expect(screen.getByText("as Sandy Sales")).toBeInTheDocument();
    expect(new Set(debuggedUserIds())).toEqual(new Set(["2"]));
  });

  it("explains a group's access as its stand-in user", async () => {
    setup();
    await screen.findByText("Sandy Sales");
    await userEvent.click(screen.getByText("Group"));
    await userEvent.click(await screen.findByText("Sales"));

    await openExplainAccessOnQuestion();

    expect(
      await screen.findByText("Access to “Orders by state”"),
    ).toBeInTheDocument();
    expect(screen.getByText("as a member of Sales")).toBeInTheDocument();
    expect(new Set(debuggedUserIds())).toEqual(new Set(["109"]));
  });

  it("closes Explain access with the button that opened it", async () => {
    setup();
    await userEvent.click(await screen.findByText("Sandy Sales"));
    await openExplainAccessOnQuestion();
    await screen.findByText("Access to “Orders by state”");

    await userEvent.click(
      screen.getByRole("button", { name: /Explain access/ }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Access to “Orders by state”"),
      ).not.toBeInTheDocument(),
    );
  });
});
