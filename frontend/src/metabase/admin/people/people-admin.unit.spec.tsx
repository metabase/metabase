import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabaseListEndpoint,
  setupEnginesEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  createMockAdminAppState,
  createMockAdminState,
} from "__support__/state";
import { renderRoutes, screen, waitFor, within } from "__support__/ui";
import { getRoutes } from "metabase/admin/routes";
import { Outlet, toRouteObjects } from "metabase/router";
import type {
  ApiKey,
  EnterpriseSettings,
  Group,
  GroupInfo,
  ListUserMembershipsResponse,
  Member,
  Membership,
  TokenFeatures,
  User,
} from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const ALL_USERS_GROUP_ID = 1;
const ADMIN_GROUP_ID = 2;
const COLLECTION_GROUP_ID = 3;
const DATA_GROUP_ID = 4;

const ADMIN_USER_ID = 1;
const NORMAL_USER_ID = 2;
const NO_COLLECTION_USER_ID = 5;

const ADMIN_NAME = "Bobby Tables";
const NORMAL_NAME = "Robert Tableton";
const NO_COLLECTION_NAME = "No Collection Tableton";

const LONG_GROUP_NAME = "a".repeat(300);
const GROUP_NAME_TOO_LONG = "Group name is too long";

type UserSeed = Pick<User, "id" | "first_name" | "last_name" | "email"> &
  Partial<User>;

const DEFAULT_USERS: UserSeed[] = [
  {
    id: ADMIN_USER_ID,
    first_name: "Bobby",
    last_name: "Tables",
    email: "admin@metabase.test",
    is_superuser: true,
  },
  {
    id: NORMAL_USER_ID,
    first_name: "Robert",
    last_name: "Tableton",
    email: "normal@metabase.test",
  },
  {
    id: 3,
    first_name: "No Data",
    last_name: "Tableton",
    email: "nodata@metabase.test",
  },
  {
    id: 4,
    first_name: "No SQL",
    last_name: "Tableton",
    email: "nosql@metabase.test",
  },
  {
    id: NO_COLLECTION_USER_ID,
    first_name: "No Collection",
    last_name: "Tableton",
    email: "nocollection@metabase.test",
  },
  {
    id: 6,
    first_name: "None",
    last_name: "Tableton",
    email: "none@metabase.test",
  },
  {
    id: 7,
    first_name: "Read Only",
    last_name: "Tableton",
    email: "readonly@metabase.test",
  },
];

const DEFAULT_GROUPS: GroupInfo[] = [
  {
    id: ALL_USERS_GROUP_ID,
    name: "All Users",
    magic_group_type: "all-internal-users",
  },
  { id: ADMIN_GROUP_ID, name: "Administrators", magic_group_type: "admin" },
  { id: COLLECTION_GROUP_ID, name: "collection", magic_group_type: null },
  { id: DATA_GROUP_ID, name: "data", magic_group_type: null },
  { id: 5, name: "readonly", magic_group_type: null },
];

const DEFAULT_MEMBERSHIPS: Pick<Membership, "user_id" | "group_id">[] = [
  { user_id: ADMIN_USER_ID, group_id: ADMIN_GROUP_ID },
  { user_id: NORMAL_USER_ID, group_id: COLLECTION_GROUP_ID },
  { user_id: 3, group_id: COLLECTION_GROUP_ID },
  { user_id: 4, group_id: COLLECTION_GROUP_ID },
  { user_id: 7, group_id: COLLECTION_GROUP_ID },
  { user_id: NORMAL_USER_ID, group_id: DATA_GROUP_ID },
  { user_id: NO_COLLECTION_USER_ID, group_id: DATA_GROUP_ID },
];

// The e2e test ran with a pro-self-hosted token, which turns on every feature.
const PRO_SELF_HOSTED_FEATURES = Object.fromEntries(
  Object.keys(createMockTokenFeatures()).map((feature) => [feature, true]),
);

const getFullName = ({ first_name, last_name }: UserSeed) =>
  [first_name, last_name].filter(Boolean).join(" ");

const parseBody = (call: CallLog): unknown =>
  JSON.parse(String(call.options.body ?? "{}"));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown, key: string) => {
  const field = isRecord(value) ? value[key] : undefined;
  return typeof field === "string" ? field : undefined;
};

const getNumber = (value: unknown, key: string) => {
  const field = isRecord(value) ? value[key] : undefined;
  return typeof field === "number" ? field : undefined;
};

const getGroupIds = (value: unknown) => {
  const field = isRecord(value) ? value.user_group_memberships : undefined;
  return Array.isArray(field)
    ? field.map((membership) => getNumber(membership, "id"))
    : [];
};

const getId = (call: CallLog) => Number(call.expressParams?.id);

/**
 * An in-memory stand-in for the users and groups endpoints. Every handler
 * branches on the request and mutates the stored data itself, so the UI only
 * shows a change after the request that makes it.
 */
function setupPeopleBackend({
  users: userSeeds = DEFAULT_USERS,
  groups: groupSeeds = DEFAULT_GROUPS,
  memberships: membershipSeeds = DEFAULT_MEMBERSHIPS,
  apiKeys = [],
}: {
  users?: UserSeed[];
  groups?: GroupInfo[];
  memberships?: Pick<Membership, "user_id" | "group_id">[];
  apiKeys?: ApiKey[];
} = {}) {
  let users: User[] = userSeeds.map((seed) =>
    createMockUser({
      ...seed,
      common_name: getFullName(seed) || seed.email,
    }),
  );
  let groups = [...groupSeeds];
  let nextMembershipId = 1;
  let memberships: Membership[] = [
    ...users.map((user) => ({
      user_id: user.id,
      group_id: ALL_USERS_GROUP_ID,
    })),
    ...membershipSeeds,
  ].map((membership) => ({
    ...membership,
    membership_id: nextMembershipId++,
    is_group_manager: false,
  }));

  const activeUserIds = () =>
    new Set(users.filter((user) => user.is_active).map((user) => user.id));

  const getMembers = (groupId: number): Member[] =>
    memberships
      .filter(
        (membership) =>
          membership.group_id === groupId &&
          activeUserIds().has(membership.user_id),
      )
      .flatMap((membership) => {
        const user = users.find(({ id }) => id === membership.user_id);
        return user
          ? [
              {
                ...membership,
                email: user.email,
                first_name: user.first_name ?? "",
                last_name: user.last_name ?? "",
                is_superuser: user.is_superuser,
              },
            ]
          : [];
      });

  const isGroupNameTooLong = (name: string | undefined) =>
    (name?.length ?? 0) > 255;

  fetchMock.get("path:/api/user", (call) => {
    const params = new URL(call.url).searchParams;
    const query = params.get("query")?.toLowerCase() ?? "";
    const status = params.get("status");
    const includeDeactivated = params.get("include_deactivated") === "true";
    const limit = params.get("limit");
    const offset = Number(params.get("offset") ?? 0);

    const matches = users
      .filter((user) => {
        if (status === "deactivated") {
          return !user.is_active;
        }
        return includeDeactivated || user.is_active;
      })
      .filter(
        (user) =>
          user.common_name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query),
      );

    return {
      data:
        limit == null ? matches : matches.slice(offset, offset + Number(limit)),
      total: matches.length,
    };
  });

  fetchMock.get("express:/api/user/:id", (call) => {
    const user = users.find(({ id }) => id === getId(call));
    return user ?? 404;
  });

  fetchMock.post("path:/api/user", (call) => {
    const body = parseBody(call);
    const email = getString(body, "email") ?? "";
    const isEmailInUse = users.some(
      (user) => user.email.toLowerCase() === email.toLowerCase(),
    );
    if (isEmailInUse) {
      return {
        status: 400,
        body: { errors: { email: "Email address already in use." } },
      };
    }

    const seed: UserSeed = {
      id: Math.max(...users.map(({ id }) => id)) + 1,
      first_name: getString(body, "first_name") ?? null,
      last_name: getString(body, "last_name") ?? null,
      email,
    };
    const groupIds = getGroupIds(body);
    const user = createMockUser({
      ...seed,
      common_name: getFullName(seed) || email,
      is_superuser: groupIds.includes(ADMIN_GROUP_ID),
    });
    users = [...users, user];
    memberships = [
      ...memberships,
      ...groupIds.flatMap((groupId) =>
        groupId == null
          ? []
          : [
              {
                user_id: user.id,
                group_id: groupId,
                membership_id: nextMembershipId++,
                is_group_manager: false,
              },
            ],
      ),
    ];
    return user;
  });

  fetchMock.put("express:/api/user/:id", (call) => {
    const body = parseBody(call);
    const firstName = getString(body, "first_name");
    if (firstName != null && firstName.trim() === "") {
      return {
        status: 400,
        body: {
          errors: { first_name: "value must be a non-blank string." },
        },
      };
    }
    users = users.map((user) => {
      if (user.id !== getId(call)) {
        return user;
      }
      const updated = {
        ...user,
        first_name: firstName ?? null,
        last_name: getString(body, "last_name") ?? null,
        email: getString(body, "email") ?? user.email,
      };
      return { ...updated, common_name: getFullName(updated) };
    });
    return users.find(({ id }) => id === getId(call)) ?? 404;
  });

  fetchMock.delete("express:/api/user/:id", (call) => {
    users = users.map((user) =>
      user.id === getId(call) ? { ...user, is_active: false } : user,
    );
    return { success: true };
  });

  fetchMock.put("express:/api/user/:id/reactivate", (call) => {
    users = users.map((user) =>
      user.id === getId(call) ? { ...user, is_active: true } : user,
    );
    return users.find(({ id }) => id === getId(call)) ?? 404;
  });

  fetchMock.get("path:/api/permissions/group", (call) => {
    const params = new URL(call.url).searchParams;
    const limit = params.get("limit");
    const offset = Number(params.get("offset") ?? 0);
    const result = groups.map((group) => ({
      ...group,
      member_count: getMembers(group.id).length,
    }));
    // The backend pages the list as soon as `limit` or `offset` is sent.
    const isPaged = limit != null || params.has("offset");
    return isPaged
      ? result.slice(offset, offset + Number(limit ?? 50))
      : result;
  });

  fetchMock.get("express:/api/permissions/group/:id", (call): Group | 404 => {
    const group = groups.find(({ id }) => id === getId(call));
    return group ? { ...group, members: getMembers(group.id) } : 404;
  });

  fetchMock.post("path:/api/permissions/group", (call) => {
    const name = getString(parseBody(call), "name") ?? "";
    if (isGroupNameTooLong(name)) {
      return { status: 400, body: { message: GROUP_NAME_TOO_LONG } };
    }
    const group: GroupInfo = {
      id: Math.max(...groups.map(({ id }) => id)) + 1,
      name,
      magic_group_type: null,
    };
    groups = [...groups, group];
    return group;
  });

  fetchMock.put("express:/api/permissions/group/:id", (call) => {
    const name = getString(parseBody(call), "name");
    if (isGroupNameTooLong(name)) {
      return { status: 400, body: { message: GROUP_NAME_TOO_LONG } };
    }
    groups = groups.map((group) =>
      group.id === getId(call) && name != null ? { ...group, name } : group,
    );
    return groups.find(({ id }) => id === getId(call)) ?? 404;
  });

  fetchMock.delete("express:/api/permissions/group/:id", (call) => {
    groups = groups.filter(({ id }) => id !== getId(call));
    return 204;
  });

  fetchMock.get("path:/api/permissions/membership", () =>
    memberships.reduce<ListUserMembershipsResponse>(
      (byUser, membership) => ({
        ...byUser,
        [membership.user_id]: [
          ...(byUser[membership.user_id] ?? []),
          membership,
        ],
      }),
      {},
    ),
  );

  fetchMock.post("path:/api/permissions/membership", (call) => {
    const body = parseBody(call);
    const userId = getNumber(body, "user_id");
    const groupId = getNumber(body, "group_id");
    if (userId == null || groupId == null) {
      return 400;
    }
    memberships = [
      ...memberships,
      {
        user_id: userId,
        group_id: groupId,
        membership_id: nextMembershipId++,
        is_group_manager: false,
      },
    ];
    return getMembers(groupId);
  });

  fetchMock.delete("express:/api/permissions/membership/:id", (call) => {
    memberships = memberships.filter(
      ({ membership_id }) => membership_id !== getId(call),
    );
    return 204;
  });

  fetchMock.get("path:/api/api-key", apiKeys);

  setupDatabaseListEndpoint([]);
  setupEnginesEndpoint({});

  return {
    getMembershipId: (userId: number, groupId: number) =>
      memberships.find(
        (membership) =>
          membership.user_id === userId && membership.group_id === groupId,
      )?.membership_id,
  };
}

interface SetupOpts {
  initialRoute?: string;
  users?: UserSeed[];
  groups?: GroupInfo[];
  memberships?: Pick<Membership, "user_id" | "group_id">[];
  apiKeys?: ApiKey[];
  settings?: Partial<EnterpriseSettings>;
  tokenFeatures?: Partial<TokenFeatures>;
  hasEnterprisePlugins?: boolean;
}

function setup({
  initialRoute = "/admin/people",
  users,
  groups,
  memberships,
  apiKeys,
  settings = {},
  tokenFeatures = {},
  hasEnterprisePlugins = false,
}: SetupOpts = {}) {
  const backend = setupPeopleBackend({ users, groups, memberships, apiKeys });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const { router } = renderRoutes(
    (store) => toRouteObjects(getRoutes(store, Outlet, Outlet)),
    {
      initialRoute,
      storeInitialState: {
        currentUser: createMockUser({
          id: ADMIN_USER_ID,
          first_name: "Bobby",
          last_name: "Tables",
          common_name: ADMIN_NAME,
          email: "admin@metabase.test",
          is_superuser: true,
        }),
        settings: mockSettings({
          "token-features": createMockTokenFeatures(tokenFeatures),
          ...settings,
        }),
        admin: createMockAdminState({
          app: createMockAdminAppState({
            paths: [
              { key: "people", getName: () => "People", path: "/admin/people" },
            ],
          }),
        }),
      },
    },
  );

  return {
    ...backend,
    getPathname: () => router?.location.pathname,
  };
}

const getBodyRows = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .filter((row) => within(row).queryAllByRole("columnheader").length === 0);

const getPeopleTable = () => screen.getByTestId("admin-people-list-table");

const expectRows = (table: HTMLElement, names: string[]) => {
  expect(getBodyRows(table)).toHaveLength(names.length);
  names.forEach((name) =>
    expect(within(table).getByText(name)).toBeInTheDocument(),
  );
};

const getPeopleRow = (name: string) =>
  screen.getByRole("row", { name: new RegExp(name) });

const getFooter = () => screen.getByTestId("people-list-footer");

const getSidebar = () => screen.getByRole("navigation", { name: "people-nav" });

const getGroupRow = (groupId: number) =>
  screen.getByRole("row", { name: `group-${groupId}-row` });

const getRequestUrl = (
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
) => {
  const call = fetchMock.callHistory.lastCall(path, { method });
  return call ? new URL(call.url) : undefined;
};

const getRequestBody = async (
  path: string,
  method: "POST" | "PUT",
): Promise<unknown> => {
  const call = fetchMock.callHistory.lastCall(path, { method });
  return call ? parseBody(call) : undefined;
};

async function openUserMenu(name: string) {
  await userEvent.click(
    within(await findPeopleRow(name)).getByRole("button", {
      name: /ellipsis/,
    }),
  );
}

async function findPeopleRow(name: string) {
  await screen.findByText(name);
  return getPeopleRow(name);
}

async function openInviteModal() {
  const inviteButton = await screen.findByRole("button", {
    name: "Invite someone",
  });
  expect(inviteButton).toBeEnabled();
  await userEvent.click(inviteButton);
  return screen.findByRole("dialog", { name: "Create user" });
}

describe("admin > people", () => {
  describe("people list", () => {
    it("searches people by name or email (metabase#12693)", async () => {
      setup();

      expect(await screen.findByText("7 people found")).toBeInTheDocument();
      expect(getBodyRows(getPeopleTable())).toHaveLength(7);

      const search = screen.getByPlaceholderText("Find someone");
      await userEvent.type(search, "no");

      await waitFor(() =>
        expect(getFooter()).toHaveTextContent("5 people found"),
      );
      expectRows(getPeopleTable(), [
        NORMAL_NAME,
        "No Data Tableton",
        "No SQL Tableton",
        NO_COLLECTION_NAME,
        "None Tableton",
      ]);
      expect(
        getRequestUrl("path:/api/user", "GET")?.searchParams.get("query"),
      ).toBe("no");

      await userEvent.type(search, "ne");

      await waitFor(() =>
        expect(getFooter()).toHaveTextContent("1 person found"),
      );
      expectRows(getPeopleTable(), ["None Tableton"]);
      expect(
        getRequestUrl("path:/api/user", "GET")?.searchParams.get("query"),
      ).toBe("none");

      await userEvent.clear(search);

      await waitFor(() =>
        expect(getFooter()).toHaveTextContent("7 people found"),
      );
      expect(getBodyRows(getPeopleTable())).toHaveLength(7);
    });

    it("switches between the People and Groups tabs", async () => {
      setup();
      await screen.findByText("7 people found");

      const peopleLink = within(getSidebar()).getByRole("link", {
        name: /People/,
      });
      const groupsLink = within(getSidebar()).getByRole("link", {
        name: /Groups/,
      });
      expect(peopleLink).toHaveAttribute("data-active", "true");
      expect(groupsLink).not.toHaveAttribute("data-active", "true");

      await userEvent.click(groupsLink);

      expect(
        await screen.findByRole("heading", { name: "Groups" }),
      ).toBeInTheDocument();
      expect(groupsLink).toHaveAttribute("data-active", "true");
      expect(peopleLink).not.toHaveAttribute("data-active", "true");
      expectRows(await screen.findByRole("table"), [
        "All Users",
        "Administrators",
        "collection",
        "data",
        "readonly",
      ]);
    });

    it("paginates people forward and backward", async () => {
      const users = Array.from({ length: 27 }, (_, index) => ({
        id: index + 1,
        first_name: `FirstName ${String(index).padStart(2, "0")}`,
        last_name: "LastName",
        email: `user_${index}@metabase.test`,
        is_superuser: index === 0,
      }));
      setup({ users, memberships: [] });

      await waitFor(() =>
        expect(getFooter()).toHaveTextContent("27 people found"),
      );
      expect(getFooter()).toHaveTextContent("1 - 25");
      expect(getBodyRows(getPeopleTable())).toHaveLength(25);
      expect(
        within(getFooter()).getByRole("button", { name: "Previous page" }),
      ).toBeDisabled();

      await userEvent.click(
        within(getFooter()).getByRole("button", { name: "Next page" }),
      );

      await waitFor(() => expect(getFooter()).toHaveTextContent("26 - 27"));
      // The range updates before the next page arrives; wait for its rows.
      await waitFor(() =>
        expect(getBodyRows(getPeopleTable())).toHaveLength(2),
      );
      expectRows(getPeopleTable(), [
        "FirstName 25 LastName",
        "FirstName 26 LastName",
      ]);
      const pageTwoUrl = getRequestUrl("path:/api/user", "GET");
      expect(pageTwoUrl?.searchParams.get("offset")).toBe("25");
      expect(pageTwoUrl?.searchParams.get("limit")).toBe("25");
      expect(
        within(getFooter()).getByRole("button", { name: "Next page" }),
      ).toBeDisabled();

      await userEvent.click(
        within(getFooter()).getByRole("button", { name: "Previous page" }),
      );

      await waitFor(() => expect(getFooter()).toHaveTextContent("1 - 25"));
      await waitFor(() =>
        expect(getBodyRows(getPeopleTable())).toHaveLength(25),
      );
      expect(
        within(getPeopleTable()).getByText("FirstName 00 LastName"),
      ).toBeInTheDocument();
    });
  });

  describe("group members", () => {
    it("lists every user in All Users and does not allow adding members to it (metabase-enterprise#210)", async () => {
      setup({ initialRoute: "/admin/people/groups" });

      await userEvent.click(
        await screen.findByRole("link", { name: /All Users/ }),
      );

      expect(
        await screen.findByTestId("admin-pane-page-title"),
      ).toHaveTextContent("All Users");
      expect(screen.getByText("7 members")).toBeInTheDocument();
      expect(getBodyRows(screen.getByRole("table"))).toHaveLength(7);
      expect(
        screen.queryByRole("button", { name: "Add members" }),
      ).not.toBeInTheDocument();
    });

    it("adds and removes a member of a group (metabase#21521)", async () => {
      const { getMembershipId } = setup({
        initialRoute: "/admin/people/groups",
      });

      const collectionRow = await waitFor(() =>
        getGroupRow(COLLECTION_GROUP_ID),
      );
      expect(
        within(collectionRow).getByLabelText("member-count"),
      ).toHaveTextContent(/^4$/);
      await userEvent.click(
        within(collectionRow).getByRole("link", { name: /collection/ }),
      );

      expect(await screen.findByText("4 members")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Add members" }),
      );
      await userEvent.type(
        screen.getByRole("textbox", { name: "Search for a user to add" }),
        "Bobby",
      );
      await userEvent.click(await screen.findByText(ADMIN_NAME));
      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(await screen.findByText("5 members")).toBeInTheDocument();
      expect(
        await getRequestBody("path:/api/permissions/membership", "POST"),
      ).toEqual({ group_id: COLLECTION_GROUP_ID, user_id: ADMIN_USER_ID });

      const adminMembershipId = getMembershipId(
        ADMIN_USER_ID,
        COLLECTION_GROUP_ID,
      );
      await userEvent.click(
        within(getPeopleRow(ADMIN_NAME)).getByRole("button", {
          name: /close/,
        }),
      );

      expect(await screen.findByText("4 members")).toBeInTheDocument();
      expect(screen.queryByText(ADMIN_NAME)).not.toBeInTheDocument();
      expect(
        getRequestUrl("express:/api/permissions/membership/:id", "DELETE")
          ?.pathname,
      ).toBe(`/api/permissions/membership/${adminMembershipId}`);
    });

    it("loads the members when opening a group directly, and drops deactivated and removed members", async () => {
      const { getMembershipId } = setup({
        initialRoute: `/admin/people/groups/${DATA_GROUP_ID}`,
      });

      expect(await screen.findByText("2 members")).toBeInTheDocument();
      expect(screen.getByText(NO_COLLECTION_NAME)).toBeInTheDocument();

      await userEvent.click(
        within(getSidebar()).getByRole("link", { name: /People/ }),
      );
      await openUserMenu(NO_COLLECTION_NAME);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Deactivate user" }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Deactivate" }),
      );
      await waitFor(() =>
        expect(screen.queryByText(NO_COLLECTION_NAME)).not.toBeInTheDocument(),
      );

      await userEvent.click(
        within(getSidebar()).getByRole("link", { name: /Groups/ }),
      );
      await userEvent.click(
        within(await waitFor(() => getGroupRow(DATA_GROUP_ID))).getByRole(
          "link",
        ),
      );

      expect(await screen.findByText("1 member")).toBeInTheDocument();
      expect(screen.queryByText(NO_COLLECTION_NAME)).not.toBeInTheDocument();

      const normalMembershipId = getMembershipId(NORMAL_USER_ID, DATA_GROUP_ID);
      await userEvent.click(
        within(getPeopleRow(NORMAL_NAME)).getByRole("button", {
          name: /close/,
        }),
      );

      expect(await screen.findByText("0 members")).toBeInTheDocument();
      expect(
        screen.getByText("Add members to get started."),
      ).toBeInTheDocument();
      expect(
        getRequestUrl("express:/api/permissions/membership/:id", "DELETE")
          ?.pathname,
      ).toBe(`/api/permissions/membership/${normalMembershipId}`);
    });

    it("paginates group members forward and backward", async () => {
      const users = Array.from({ length: 27 }, (_, index) => ({
        id: index + 1,
        first_name: `FirstName ${String(index).padStart(2, "0")}`,
        last_name: "LastName",
        email: `user_${index}@metabase.test`,
        is_superuser: index === 0,
      }));
      setup({
        users,
        memberships: [],
        initialRoute: `/admin/people/groups/${ALL_USERS_GROUP_ID}`,
      });

      expect(await screen.findByText("27 members")).toBeInTheDocument();
      expect(screen.getByText("1 - 25")).toBeInTheDocument();
      expect(getBodyRows(screen.getByRole("table"))).toHaveLength(25);
      expect(
        screen.getByRole("button", { name: "Previous page" }),
      ).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: "Next page" }));

      expect(await screen.findByText("26 - 27")).toBeInTheDocument();
      expectRows(screen.getByRole("table"), [
        "FirstName 25 LastName",
        "FirstName 26 LastName",
      ]);
      expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

      await userEvent.click(
        screen.getByRole("button", { name: "Previous page" }),
      );

      expect(await screen.findByText("1 - 25")).toBeInTheDocument();
      expect(getBodyRows(screen.getByRole("table"))).toHaveLength(25);
    });
  });

  describe("creating users", () => {
    it("creates a user and returns to the people list", async () => {
      const { getPathname } = setup();

      const modal = await openInviteModal();
      await userEvent.type(within(modal).getByLabelText("First name"), "Testy");
      await userEvent.type(
        within(modal).getByLabelText("Last name"),
        "McTestface",
      );
      await userEvent.type(
        within(modal).getByLabelText(/Email/),
        "testy@metabase.test",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Create" }),
      );

      const successModal = await screen.findByRole("dialog", {
        name: "Testy McTestface has been added",
      });
      expect(await getRequestBody("path:/api/user", "POST")).toEqual({
        first_name: "Testy",
        last_name: "McTestface",
        email: "testy@metabase.test",
        password: expect.any(String),
      });

      await userEvent.click(
        within(successModal).getByRole("button", { name: "Done" }),
      );

      expect(await findPeopleRow("Testy McTestface")).toBeInTheDocument();
      expect(getPathname()).toBe("/admin/people");
    });

    it("creates a user without a first or last name (metabase#22754)", async () => {
      setup();

      const modal = await openInviteModal();
      await userEvent.type(
        within(modal).getByLabelText(/Email/),
        "nameless@metabase.test",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Create" }),
      );

      const successModal = await screen.findByRole("dialog", {
        name: "nameless@metabase.test has been added",
      });
      const body = await getRequestBody("path:/api/user", "POST");
      expect(body).toEqual({
        email: "nameless@metabase.test",
        password: expect.any(String),
      });

      await userEvent.click(
        within(successModal).getByRole("button", { name: "Done" }),
      );

      expect(
        await screen.findByRole("cell", { name: "nameless@metabase.test" }),
      ).toBeInTheDocument();
    });

    it("rejects the email of an existing user in another case (metabase#16350)", async () => {
      const { getPathname } = setup();

      const modal = await openInviteModal();
      await userEvent.type(
        within(modal).getByLabelText("First name"),
        "RobertNew",
      );
      await userEvent.type(
        within(modal).getByLabelText("Last name"),
        "TabletonNew",
      );
      await userEvent.type(
        within(modal).getByLabelText(/Email/),
        "NORMAL@METABASE.TEST",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Create" }),
      );

      expect(
        await within(modal).findByText("Email address already in use."),
      ).toBeInTheDocument();
      expect(
        getString(await getRequestBody("path:/api/user", "POST"), "email"),
      ).toBe("NORMAL@METABASE.TEST");
      expect(getPathname()).toBe("/admin/people/new");
    });

    it("tells that an invite was sent when email is set up and password login is on", async () => {
      setup({
        settings: {
          "email-configured?": true,
          "google-auth-enabled": true,
          "enable-password-login": true,
        },
      });

      const modal = await openInviteModal();
      await userEvent.type(within(modal).getByLabelText("First name"), "Testy");
      await userEvent.type(
        within(modal).getByLabelText("Last name"),
        "McTestface",
      );
      await userEvent.type(
        within(modal).getByLabelText(/Email/),
        "testy@metabase.test",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Create" }),
      );

      const successModal = await screen.findByRole("dialog", {
        name: "Testy McTestface has been added",
      });
      expect(successModal).toHaveTextContent(
        "We’ve sent an invite to testy@metabase.test with instructions to set their password.",
      );
      expect(await getRequestBody("path:/api/user", "POST")).toEqual({
        first_name: "Testy",
        last_name: "McTestface",
        email: "testy@metabase.test",
      });

      await userEvent.click(
        within(successModal).getByRole("button", { name: "Done" }),
      );
      expect(await findPeopleRow("Testy McTestface")).toBeInTheDocument();
    });

    it("offers a password reset link after an SSO invite and hides password resets when password login is off (metabase#23630)", async () => {
      const { getPathname } = setup({
        hasEnterprisePlugins: true,
        tokenFeatures: PRO_SELF_HOSTED_FEATURES,
        settings: {
          "email-configured?": true,
          "google-auth-enabled": true,
          "enable-password-login": false,
        },
      });

      const modal = await openInviteModal();
      await userEvent.type(within(modal).getByLabelText("First name"), "Testy");
      await userEvent.type(
        within(modal).getByLabelText("Last name"),
        "McTestface",
      );
      await userEvent.type(
        within(modal).getByLabelText(/Email/),
        "testy@metabase.test",
      );
      await userEvent.click(
        within(modal).getByRole("button", { name: "Create" }),
      );

      const successModal = await screen.findByRole("dialog", {
        name: "Testy McTestface has been added",
      });
      expect(successModal).toHaveTextContent(
        "We’ve sent an invite to testy@metabase.test with instructions to log in. If this user is unable to authenticate then you can reset their password.",
      );
      const newUserId = getPathname()?.match(
        /^\/admin\/people\/(\d+)\/success$/,
      )?.[1];
      expect(newUserId).toBe("8");
      expect(
        within(successModal).getByRole("link", {
          name: "reset their password.",
        }),
      ).toHaveAttribute("href", `/admin/people/${newUserId}/reset`);

      await userEvent.click(
        within(successModal).getByRole("button", { name: "Done" }),
      );
      expect(await findPeopleRow("Testy McTestface")).toBeInTheDocument();

      await openUserMenu(NORMAL_NAME);
      expect(
        await screen.findByRole("menuitem", { name: "Edit user" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Reset password" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("deactivating users", () => {
    it("does not let admins deactivate themselves", async () => {
      setup();

      await openUserMenu(ADMIN_NAME);

      expect(
        await screen.findByRole("menuitem", { name: "Edit user" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: "Reset password" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: "Deactivate user" }),
      ).not.toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      );

      await openUserMenu(NORMAL_NAME);
      expect(
        await screen.findByRole("menuitem", { name: "Deactivate user" }),
      ).toBeInTheDocument();
    });

    it("deactivates and reactivates another admin", async () => {
      const { getPathname } = setup({
        users: DEFAULT_USERS.map((user) =>
          user.id === NORMAL_USER_ID ? { ...user, is_superuser: true } : user,
        ),
      });

      await openUserMenu(NORMAL_NAME);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Deactivate user" }),
      );
      const deactivateModal = await screen.findByRole("dialog", {
        name: `Deactivate ${NORMAL_NAME}?`,
      });
      await userEvent.click(
        within(deactivateModal).getByRole("button", { name: "Deactivate" }),
      );

      await waitFor(() =>
        expect(screen.queryByText(NORMAL_NAME)).not.toBeInTheDocument(),
      );
      expect(getRequestUrl("express:/api/user/:id", "DELETE")?.pathname).toBe(
        `/api/user/${NORMAL_USER_ID}`,
      );
      expect(getPathname()).toBe("/admin/people");

      await userEvent.click(
        await screen.findByRole("tab", { name: "Deactivated" }),
      );
      const deactivatedRow = await findPeopleRow(NORMAL_NAME);
      expectRows(getPeopleTable(), [NORMAL_NAME]);

      await userEvent.click(within(deactivatedRow).getByRole("link"));
      const reactivateModal = await screen.findByRole("dialog", {
        name: `Reactivate ${NORMAL_NAME}?`,
      });
      await userEvent.click(
        within(reactivateModal).getByRole("button", { name: "Reactivate" }),
      );

      await waitFor(() => expect(getPathname()).toBe("/admin/people"));
      expect(
        getRequestUrl("express:/api/user/:id/reactivate", "PUT")?.pathname,
      ).toBe(`/api/user/${NORMAL_USER_ID}/reactivate`);
      expect(await findPeopleRow(NORMAL_NAME)).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.queryByRole("tab", { name: "Deactivated" }),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe("editing users", () => {
    it("shows the API error for a blank name and saves a valid one (metabase#46449)", async () => {
      const { getPathname } = setup();

      await openUserMenu(NORMAL_NAME);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Edit user" }),
      );
      const modal = await screen.findByRole("dialog", { name: "Edit user" });
      const firstName = await within(modal).findByLabelText("First name");

      await userEvent.clear(firstName);
      await userEvent.type(firstName, " ");
      await userEvent.click(
        await within(modal).findByRole("button", { name: "Update" }),
      );

      expect(
        await within(modal).findByText(/non-blank string./),
      ).toBeInTheDocument();

      await userEvent.clear(firstName);
      await userEvent.type(firstName, "John");
      // The submit button reads "Failed" for a few seconds after the error.
      await userEvent.click(
        await within(modal).findByRole(
          "button",
          { name: "Update" },
          { timeout: 5000 },
        ),
      );

      expect(await findPeopleRow("John Tableton")).toBeInTheDocument();
      expect(screen.queryByText(NORMAL_NAME)).not.toBeInTheDocument();
      expect(getPathname()).toBe("/admin/people");
      const putUrl = getRequestUrl("express:/api/user/:id", "PUT");
      expect(putUrl?.pathname).toBe(`/api/user/${NORMAL_USER_ID}`);
      expect(
        await getRequestBody("express:/api/user/:id", "PUT"),
      ).toMatchObject({
        first_name: "John",
        last_name: "Tableton",
        email: "normal@metabase.test",
      });
    });
  });

  describe("groups", () => {
    const COLLECTION_API_KEY: ApiKey = {
      id: 1,
      name: "MyApiKey",
      group: { id: COLLECTION_GROUP_ID, name: "collection" },
      creator_id: ADMIN_USER_ID,
      masked_key: "mb_1234...",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      updated_by: { id: ADMIN_USER_ID, common_name: ADMIN_NAME },
    };

    async function openGroupActions(groupId: number) {
      await userEvent.click(
        within(getGroupRow(groupId)).getByRole("button", {
          name: "group-action-button",
        }),
      );
    }

    it("creates a group and shows API errors when creating it (metabase#52886)", async () => {
      setup({ initialRoute: "/admin/people/groups" });

      await userEvent.click(
        await screen.findByRole("button", { name: "Create a group" }),
      );
      await userEvent.type(
        await screen.findByPlaceholderText(/something like/i),
        "My New Group",
      );
      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(
        await screen.findByRole("row", { name: "group-6-row" }),
      ).toHaveTextContent("My New Group");
      expect(
        await getRequestBody("path:/api/permissions/group", "POST"),
      ).toEqual({ name: "My New Group" });

      await userEvent.click(
        screen.getByRole("button", { name: "Create a group" }),
      );
      await userEvent.type(
        screen.getByPlaceholderText(/something like/i),
        LONG_GROUP_NAME,
      );
      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      const alert = await screen.findByTestId("alert-modal");
      expect(alert).toHaveTextContent(GROUP_NAME_TOO_LONG);
      expect(
        await getRequestBody("path:/api/permissions/group", "POST"),
      ).toEqual({ name: LONG_GROUP_NAME });
      await userEvent.click(within(alert).getByRole("button", { name: "Ok" }));
      await waitFor(() =>
        expect(screen.queryByTestId("alert-modal")).not.toBeInTheDocument(),
      );
    });

    it("shows API errors when renaming a group, and removes a group (metabase#52886)", async () => {
      setup({ initialRoute: "/admin/people/groups" });
      await waitFor(() => getGroupRow(DATA_GROUP_ID));

      await openGroupActions(DATA_GROUP_ID);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Edit Name" }),
      );
      const nameInput = screen.getByDisplayValue("data");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, LONG_GROUP_NAME);
      await userEvent.click(screen.getByRole("button", { name: "Done" }));

      const alert = await screen.findByTestId("alert-modal");
      expect(alert).toHaveTextContent(GROUP_NAME_TOO_LONG);
      expect(
        getRequestUrl("express:/api/permissions/group/:id", "PUT")?.pathname,
      ).toBe(`/api/permissions/group/${DATA_GROUP_ID}`);
      expect(
        await getRequestBody("express:/api/permissions/group/:id", "PUT"),
      ).toEqual({ name: LONG_GROUP_NAME });

      await userEvent.click(within(alert).getByRole("button", { name: "Ok" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(getGroupRow(DATA_GROUP_ID)).toHaveTextContent("data");

      await openGroupActions(DATA_GROUP_ID);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Remove Group" }),
      );
      const removeModal = await screen.findByRole("dialog", {
        name: "Remove this group?",
      });
      await userEvent.click(
        within(removeModal).getByRole("button", { name: "Remove group" }),
      );

      await waitFor(() =>
        expect(
          screen.queryByRole("row", { name: `group-${DATA_GROUP_ID}-row` }),
        ).not.toBeInTheDocument(),
      );
      expect(
        getRequestUrl("express:/api/permissions/group/:id", "DELETE")?.pathname,
      ).toBe(`/api/permissions/group/${DATA_GROUP_ID}`);
      expect(getGroupRow(COLLECTION_GROUP_ID)).toBeInTheDocument();
    });

    it("shows the API keys of a group and warns about them when removing it", async () => {
      setup({
        initialRoute: "/admin/people/groups",
        apiKeys: [COLLECTION_API_KEY],
      });

      const collectionRow = await waitFor(() =>
        getGroupRow(COLLECTION_GROUP_ID),
      );
      expect(collectionRow).toHaveTextContent("(includes 1 API key)");
      expect(getGroupRow(DATA_GROUP_ID)).not.toHaveTextContent("API key");

      await openGroupActions(COLLECTION_GROUP_ID);
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Remove Group" }),
      );

      const modal = await screen.findByRole("dialog", {
        name: "Are you sure you want remove this group and its API key?",
      });
      expect(
        within(modal).getByRole("button", { name: "Remove group and API key" }),
      ).toBeInTheDocument();
    });

    it("shows more than 50 groups (metabase#17200)", async () => {
      const groups = [
        ...DEFAULT_GROUPS,
        ...Array.from({ length: 51 }, (_, index) => ({
          id: 100 + index,
          name: `Group${index}`,
          magic_group_type: null,
        })),
      ];
      setup({ initialRoute: "/admin/people/groups", groups });

      expect(await screen.findByText("Group50")).toBeInTheDocument();
      expect(getBodyRows(screen.getByRole("table"))).toHaveLength(56);
      const url = getRequestUrl("path:/api/permissions/group", "GET");
      expect(url?.searchParams.has("limit")).toBe(false);
      expect(url?.searchParams.has("offset")).toBe(false);
    });
  });
});
