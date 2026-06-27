import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { GroupId } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";

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

function setup(initialValue: GroupId[] = [ALL_USERS.id]) {
  const onChange = jest.fn<void, [GroupId[]]>();

  function Wrapper() {
    const [value, setValue] = useState<GroupId[]>(initialValue);
    return (
      <GroupsMultiSelect
        groups={GROUPS}
        value={value}
        onChange={(ids) => {
          onChange(ids);
          setValue(ids);
        }}
      />
    );
  }

  renderWithProviders(<Wrapper />);
  return { onChange };
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
});
