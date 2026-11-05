import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type {
  Collection,
  CollectionNamespace,
  CollectionPermissionsGraph,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockGroup,
} from "metabase-types/api/mocks";

import { CollectionPermissionsModal } from "./CollectionPermissionsModal";

const ALL_USERS_GROUP = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});

const ADMIN_GROUP = createMockGroup({
  id: 2,
  name: "Administrators",
  magic_group_type: "admin",
});

const ROOT_COLLECTION_NAME = "Root";

interface SetupOpts {
  namespace: CollectionNamespace;
  collections?: Collection[];
  groups?: CollectionPermissionsGraph["groups"];
  slug?: string;
}

function setup({
  namespace,
  collections = [],
  groups = {
    [ALL_USERS_GROUP.id]: { root: "read" },
    [ADMIN_GROUP.id]: { root: "write" },
  },
  slug = "root",
}: SetupOpts) {
  setupGroupsEndpoint([ALL_USERS_GROUP, ADMIN_GROUP]);
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({
        id: "root",
        name: ROOT_COLLECTION_NAME,
        namespace,
      }),
      ...collections,
    ],
  });
  setupCollectionPermissionsGraphEndpoint({ revision: 1, groups });
  renderWithProviders(
    <CollectionPermissionsModal
      params={{ slug }}
      namespace={namespace}
      onClose={jest.fn()}
    />,
  );
}

async function getPermissionSelects(collectionName = ROOT_COLLECTION_NAME) {
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("heading", {
    name: `Permissions for ${collectionName}`,
  });
  const [adminSelect, allUsersSelect] =
    within(dialog).getAllByTestId("permissions-select");
  return { dialog, allUsersSelect, adminSelect };
}

describe("CollectionPermissionsModal", () => {
  it("should keep curate to admins in the data actions namespace and say why", async () => {
    setup({ namespace: "data-actions" });

    const { dialog, allUsersSelect, adminSelect } =
      await getPermissionSelects();
    expect(adminSelect).toHaveTextContent("Curate");
    expect(adminSelect).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(allUsersSelect);
    expect(
      within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["No access"]);

    await userEvent.hover(within(dialog).getByLabelText("info icon"));
    await waitFor(() =>
      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Only administrators can create and edit data actions. Groups with View access can run them.",
      ),
    );
  });

  it("should offer curate to any group in the snippets namespace", async () => {
    setup({ namespace: "snippets" });

    const { dialog, allUsersSelect } = await getPermissionSelects();
    await userEvent.click(allUsersSelect);
    expect(
      within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Curate", "No access"]);
    expect(
      within(dialog).queryByLabelText("info icon"),
    ).not.toBeInTheDocument();
  });

  it("should keep the root permissions when the permissions of a snippet folder change (metabase#17268)", async () => {
    const FOLDER_ID = 5;
    const folder = createMockCollection({
      id: FOLDER_ID,
      name: "Snippet Folder",
      namespace: "snippets",
      location: "/",
    });
    setup({
      namespace: "snippets",
      collections: [folder],
      groups: {
        [ALL_USERS_GROUP.id]: { root: "write", [FOLDER_ID]: "write" },
        [ADMIN_GROUP.id]: { root: "write", [FOLDER_ID]: "write" },
      },
      slug: String(FOLDER_ID),
    });

    const { dialog, allUsersSelect } = await getPermissionSelects(folder.name);
    expect(allUsersSelect).toHaveTextContent("Curate");
    await userEvent.click(allUsersSelect);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("No access"),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const request = await waitFor(() => {
      const lastRequest = fetchMock.callHistory.lastCall(
        "path:/api/collection/graph",
        { method: "PUT" },
      )?.request;
      expect(lastRequest).toBeDefined();
      return lastRequest;
    });
    const body: unknown = await request?.json();
    expect(body).toEqual({
      namespace: "snippets",
      revision: 1,
      groups: { [ALL_USERS_GROUP.id]: { root: "write", [FOLDER_ID]: "none" } },
    });
  });
});
