import userEvent from "@testing-library/user-event";

import {
  setupCollectionPermissionsGraphEndpoint,
  setupCollectionsEndpoints,
  setupGroupsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { CollectionNamespace } from "metabase-types/api";
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

function setup(namespace: CollectionNamespace) {
  setupGroupsEndpoint([ALL_USERS_GROUP, ADMIN_GROUP]);
  setupCollectionsEndpoints({
    collections: [
      createMockCollection({
        id: "root",
        name: "Root",
        namespace,
      }),
    ],
  });
  setupCollectionPermissionsGraphEndpoint({
    revision: 1,
    groups: {
      [ALL_USERS_GROUP.id]: { root: "read" },
      [ADMIN_GROUP.id]: { root: "write" },
    },
  });
  renderWithProviders(
    <CollectionPermissionsModal
      params={{ slug: "root" }}
      namespace={namespace}
      onClose={jest.fn()}
    />,
  );
}

async function getPermissionSelects() {
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByRole("heading", { name: "Permissions for Root" });
  const [adminSelect, allUsersSelect] =
    within(dialog).getAllByTestId("permissions-select");
  return { dialog, allUsersSelect, adminSelect };
}

describe("CollectionPermissionsModal", () => {
  it("should keep curate to admins in the data actions namespace and say why", async () => {
    setup("data-actions");

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
    setup("snippets");

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
});
