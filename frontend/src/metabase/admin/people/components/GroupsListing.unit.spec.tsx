import userEvent from "@testing-library/user-event";

import { setupApiKeyEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { ApiKey, GroupInfo } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";

import { GroupsListing } from "./GroupsListing";

interface SetupOpts {
  groups?: GroupInfo[];
  apiKeys?: ApiKey[];
  createError?: unknown;
  updateError?: unknown;
  deleteError?: unknown;
}

const setup = ({
  groups = [createMockGroup()],
  apiKeys = [],
  createError,
  updateError,
  deleteError,
}: SetupOpts = {}) => {
  setupApiKeyEndpoints(apiKeys);

  const settle = (error: unknown) =>
    error ? Promise.reject(error) : Promise.resolve();

  const props = {
    groups: groups.map((g) => ({ ...g, members: [] })),
    isAdmin: true,
    create: jest.fn((_group: { name: string }) => settle(createError)),
    update: jest.fn((_group: { id: number; name: string }) =>
      settle(updateError),
    ),
    delete: jest.fn((_group: GroupInfo, _groupCount: number) =>
      settle(deleteError),
    ),
  };

  renderWithProviders(<GroupsListing {...props} />);

  return props;
};

describe("GroupsListing", () => {
  it("shows groups with non-Latin names", async () => {
    setup({
      groups: [
        createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
      ],
    });

    expect(await screen.findByText("здравей")).toBeInTheDocument();
  });

  it("shows groups with non-Latin names alongside Latin-named groups", async () => {
    setup({
      groups: [
        createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
        createMockGroup({
          id: 11,
          name: "Engineering",
          magic_group_type: null,
        }),
      ],
    });

    expect(await screen.findByText("здравей")).toBeInTheDocument();
    expect(await screen.findByText("Engineering")).toBeInTheDocument();
  });

  it("filters non-Latin groups by search text", async () => {
    setup({
      groups: [
        createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
        createMockGroup({
          id: 11,
          name: "Engineering",
          magic_group_type: null,
        }),
      ],
    });

    await screen.findByText("здравей");
    const searchInput = screen.getByPlaceholderText("Find a group");
    await userEvent.type(searchInput, "здрав");

    expect(screen.getByText("здравей")).toBeInTheDocument();
    expect(screen.queryByText("Engineering")).not.toBeInTheDocument();
  });

  it("excludes non-matching non-Latin groups when searching", async () => {
    setup({
      groups: [
        createMockGroup({ id: 10, name: "здравей", magic_group_type: null }),
        createMockGroup({
          id: 11,
          name: "Engineering",
          magic_group_type: null,
        }),
      ],
    });

    await screen.findByText("здравей");
    const searchInput = screen.getByPlaceholderText("Find a group");
    await userEvent.type(searchInput, "Eng");

    expect(screen.queryByText("здравей")).not.toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
  });
});

const COLLECTION = createMockGroup({
  id: 10,
  name: "collection",
  member_count: 4,
  magic_group_type: null,
});

const createApiKey = (group: GroupInfo): ApiKey => ({
  id: 1,
  name: "MyApiKey",
  group: { id: group.id, name: group.name },
  creator_id: 1,
  masked_key: "mb_abc...",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: { id: 1, common_name: "Bobby Tables" },
});

// The length the app DB's `permissions_group.name` column rejects.
const TOO_LONG_NAME = "a".repeat(300);
const TOO_LONG_NAME_ERROR = {
  status: 500,
  data: { message: "Value too long for column NAME" },
};

const openGroupActions = async (group: GroupInfo) => {
  const row = await screen.findByLabelText(`group-${group.id}-row`);
  await userEvent.click(
    within(row).getByRole("button", { name: "group-action-button" }),
  );
};

const startCreatingAGroup = async (name: string) => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Create a group" }),
  );
  await userEvent.type(
    screen.getByPlaceholderText('Something like "Marketing"'),
    name,
  );
};

describe("GroupsListing group creation", () => {
  it("should create a group with the typed name", async () => {
    const { create } = setup();
    await startCreatingAGroup("My New Group");

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(create).toHaveBeenCalledWith({ name: "My New Group" });
    expect(
      screen.queryByPlaceholderText('Something like "Marketing"'),
    ).not.toBeInTheDocument();
  });

  it("should refuse to submit an empty name", async () => {
    setup();
    await userEvent.click(
      await screen.findByRole("button", { name: "Create a group" }),
    );

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("should show the API error when creating fails (metabase#52886)", async () => {
    setup({ createError: TOO_LONG_NAME_ERROR });
    await startCreatingAGroup(TOO_LONG_NAME);

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("Value too long for column NAME"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ok" }));

    expect(
      screen.queryByText("Value too long for column NAME"),
    ).not.toBeInTheDocument();
  });
});

describe("GroupsListing group renaming", () => {
  it("should rename a group", async () => {
    const { update } = setup({ groups: [COLLECTION] });
    await openGroupActions(COLLECTION);
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit Name" }));

    await userEvent.type(screen.getByDisplayValue("collection"), " updated");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(update).toHaveBeenCalledWith({
      id: COLLECTION.id,
      name: "collection updated",
    });
  });

  it("should show the API error when renaming fails (metabase#52886)", async () => {
    setup({ groups: [COLLECTION], updateError: TOO_LONG_NAME_ERROR });
    await openGroupActions(COLLECTION);
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit Name" }));

    await userEvent.type(screen.getByDisplayValue("collection"), TOO_LONG_NAME);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(
      await screen.findByText("Value too long for column NAME"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ok" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("collection")).toBeInTheDocument();
  });
});

describe("GroupsListing group removal", () => {
  it("should remove a group once confirmed", async () => {
    const groups = [COLLECTION, createMockGroup({ id: 11, name: "data" })];
    const props = setup({ groups });
    await openGroupActions(COLLECTION);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove Group" }),
    );

    expect(await screen.findByText("Remove this group?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove group" }));

    expect(props.delete).toHaveBeenCalledWith(
      expect.objectContaining({ id: COLLECTION.id }),
      groups.length,
    );
  });

  it("should warn that the group's API key goes with it", async () => {
    setup({ groups: [COLLECTION], apiKeys: [createApiKey(COLLECTION)] });

    expect(await screen.findByText("(includes 1 API key)")).toBeInTheDocument();

    await openGroupActions(COLLECTION);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Remove Group" }),
    );

    expect(
      await screen.findByText(
        "Are you sure you want remove this group and its API key?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove group and API key" }),
    ).toBeInTheDocument();
  });

  it("should not offer to remove the default or admin groups", async () => {
    setup({
      groups: [
        createMockGroup({
          id: 1,
          name: "All Users",
          magic_group_type: "all-internal-users",
        }),
        createMockGroup({
          id: 2,
          name: "Administrators",
          magic_group_type: "admin",
        }),
      ],
    });
    await screen.findByText("All Users");

    expect(
      screen.queryByRole("button", { name: "group-action-button" }),
    ).not.toBeInTheDocument();
  });
});

describe("GroupsListing with many groups", () => {
  it("should list more than 50 groups (metabase#17200)", async () => {
    const groups = Array.from({ length: 51 }, (_, index) =>
      createMockGroup({
        id: index + 100,
        name: `Group${index}`,
        magic_group_type: null,
      }),
    );
    setup({ groups: [...groups, COLLECTION] });

    await screen.findByText("Group0");
    expect(screen.getByText("Group50")).toBeInTheDocument();
    expect(screen.getByText("collection")).toBeInTheDocument();
  });
});
