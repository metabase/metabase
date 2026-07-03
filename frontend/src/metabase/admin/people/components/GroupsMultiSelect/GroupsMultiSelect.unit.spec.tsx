import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { GroupId } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { GroupsMultiSelect } from "./GroupsMultiSelect";

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
const GROUPS = [ALL_USERS, ADMINISTRATORS, MARKETING];

function setup(
  initialValue: GroupId[] = [ALL_USERS.id],
  { managerGroupIds = [] }: { managerGroupIds?: GroupId[] } = {},
) {
  const onChange = jest.fn<void, [GroupId[]]>();
  const onToggleManager = jest.fn<void, [GroupId]>();

  function Wrapper() {
    const [value, setValue] = useState<GroupId[]>(initialValue);
    const [managers, setManagers] = useState<GroupId[]>(managerGroupIds);
    return (
      <GroupsMultiSelect
        groups={GROUPS}
        value={value}
        onChange={(ids) => {
          onChange(ids);
          setValue(ids);
        }}
        managerGroupIds={managers}
        onToggleManager={(id) => {
          onToggleManager(id);
          setManagers((prev) =>
            prev.includes(id)
              ? prev.filter((groupId) => groupId !== id)
              : [...prev, id],
          );
        }}
      />
    );
  }

  renderWithProviders(<Wrapper />);
  return { onChange, onToggleManager };
}

// Selected groups render as pills inside the input's `list`; the dropdown
// options live in a separate `listbox`, so scope pill assertions to the list.
const getPills = () => within(screen.getByRole("list"));
const getRemoveButtons = () =>
  screen.queryAllByRole("button", { name: "Remove" });

describe("GroupsMultiSelect", () => {
  it("renders the selected groups as pills", () => {
    setup([ALL_USERS.id, ADMINISTRATORS.id]);

    expect(getPills().getByText("All Users")).toBeInTheDocument();
    expect(getPills().getByText("Administrators")).toBeInTheDocument();
  });

  it("locks the default group so it cannot be removed", () => {
    setup([ALL_USERS.id]);

    // The locked default group renders without a remove control.
    expect(getRemoveButtons()).toHaveLength(0);
  });

  it("removes a non-default group via its pill", async () => {
    const { onChange } = setup([ALL_USERS.id, ADMINISTRATORS.id]);

    // All Users stays locked, so the only remove control is Administrators'.
    expect(getRemoveButtons()).toHaveLength(1);
    await userEvent.click(getRemoveButtons()[0]);

    expect(onChange).toHaveBeenLastCalledWith([ALL_USERS.id]);
  });

  it("adds a group selected from the dropdown", async () => {
    const { onChange } = setup([ALL_USERS.id]);

    await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Marketing" }),
    );

    expect(onChange).toHaveBeenLastCalledWith([ALL_USERS.id, MARKETING.id]);
  });

  it("tags a managed group's pill with (Manager)", () => {
    setup([ALL_USERS.id, MARKETING.id], { managerGroupIds: [MARKETING.id] });

    expect(getPills().getByText("Marketing (Manager)")).toBeInTheDocument();
    // A group the user does not manage keeps a plain pill.
    expect(getPills().getByText("All Users")).toBeInTheDocument();
  });

  it("separates the built-in groups from custom groups in the dropdown", async () => {
    setup([ALL_USERS.id]);

    await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));

    // All Users / Administrators are built-in; Marketing is custom, divider between.
    expect(await screen.findByRole("separator")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Marketing" }),
    ).toBeInTheDocument();
  });

  it("removes the last removable group on Backspace in an empty field", async () => {
    const { onChange } = setup([ALL_USERS.id, ADMINISTRATORS.id]);

    await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
    await userEvent.keyboard("{Backspace}");

    // All Users stays locked; Administrators is the last removable group.
    expect(onChange).toHaveBeenLastCalledWith([ALL_USERS.id]);
  });

  it("does not remove a group on Backspace when only whitespace is typed", async () => {
    const { onChange } = setup([ALL_USERS.id, ADMINISTRATORS.id]);

    const input = screen.getByRole("combobox", { name: "Groups" });
    await userEvent.click(input);
    await userEvent.type(input, " ");
    await userEvent.keyboard("{Backspace}");

    expect(onChange).not.toHaveBeenCalled();
  });

  describe("with the group-managers feature (EE)", () => {
    beforeEach(() => {
      mockSettings({
        "token-features": createMockTokenFeatures({
          advanced_permissions: true,
        }),
      });
      setupEnterprisePlugins();
    });

    it("promotes a member to manager via the dropdown toggle", async () => {
      const { onToggleManager } = setup([ALL_USERS.id, MARKETING.id]);

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));

      // The toggle only shows for eligible selected groups (Marketing).
      await userEvent.click(
        await screen.findByRole("button", { name: "Turn into Manager" }),
      );

      expect(onToggleManager).toHaveBeenCalledWith(MARKETING.id);
    });
  });
});
