import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { GroupId, GroupInfo } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { type GroupSection, GroupsMultiSelect } from "./GroupsMultiSelect";

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
const SALES = createMockGroup({
  id: 4,
  name: "Sales",
  magic_group_type: null,
});
const GROUPS = [ALL_USERS, ADMINISTRATORS, MARKETING, SALES];

const ALL_TENANT_USERS = createMockGroup({
  id: 10,
  name: "All tenant users",
  magic_group_type: "all-external-users",
});
const CONTRACTORS = createMockGroup({
  id: 11,
  name: "Contractors",
  magic_group_type: null,
});

function setup(
  initialValue: GroupId[] = [ALL_USERS.id],
  {
    managerGroupIds = [],
    groups = GROUPS,
    sections,
  }: {
    managerGroupIds?: GroupId[];
    groups?: GroupInfo[];
    sections?: GroupSection[];
  } = {},
) {
  const onChange = jest.fn<void, [GroupId[]]>();
  const onToggleManager = jest.fn<void, [GroupId]>();

  function Wrapper() {
    const [value, setValue] = useState<GroupId[]>(initialValue);
    const [managers, setManagers] = useState<GroupId[]>(managerGroupIds);
    return (
      <GroupsMultiSelect
        groups={groups}
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
        sections={sections}
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
  screen.queryAllByRole("button", { name: /^Remove / });

// True when `a` precedes `b` in DOM order.
const isBefore = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

// Asserts exactly one dropdown divider, sitting between the two named options.
const expectSingleDividerBetween = (before: string, after: string) => {
  const separators = screen.getAllByRole("separator");
  expect(separators).toHaveLength(1);
  expect(
    isBefore(screen.getByRole("option", { name: before }), separators[0]),
  ).toBe(true);
  expect(
    isBefore(separators[0], screen.getByRole("option", { name: after })),
  ).toBe(true);
};

// The labeled sections carry role="group", so their contents can be scoped.
const getSection = (name: string) =>
  within(screen.getByRole("group", { name }));

describe("GroupsMultiSelect", () => {
  it("renders the selected groups as pills", () => {
    setup([ALL_USERS.id, ADMINISTRATORS.id]);

    expect(getPills().getByText("All Users")).toBeInTheDocument();
    expect(getPills().getByText("Administrators")).toBeInTheDocument();
  });

  it("removes a non-default group via its pill", async () => {
    const { onChange } = setup([ALL_USERS.id, ADMINISTRATORS.id]);

    // All Users stays locked, so Administrators has the only remove control,
    // and its label names the group so pills stay distinguishable.
    expect(getRemoveButtons()).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Administrators" }),
    );

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
    // A group the user does not manage keeps a plain pill, with no tag.
    expect(getPills().getByText("All Users")).toBeInTheDocument();
    expect(
      getPills().queryByText(/All Users \(Manager\)/),
    ).not.toBeInTheDocument();
  });

  it("separates the built-in groups from custom groups in the dropdown", async () => {
    setup([ALL_USERS.id]);

    await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
    await screen.findByRole("option", { name: "Marketing" });

    // Built-in groups (Administrators, All Users) sort above the custom ones
    // (Marketing, Sales), with a single divider at exactly that boundary.
    expectSingleDividerBetween("All Users", "Marketing");
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

  it("does not render the manager toggle without the group-managers feature", async () => {
    setup([ALL_USERS.id, MARKETING.id]);

    await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
    // Wait for the dropdown so the toggle would have rendered if it were going to.
    await screen.findByRole("option", { name: "Marketing" });

    // In OSS the group-managers plugin is a no-op, so no toggle appears.
    expect(
      screen.queryByRole("button", { name: /Turn into (Manager|Member)/ }),
    ).not.toBeInTheDocument();
  });

  describe("with sections", () => {
    const SECTIONS = [
      {
        label: "Can view this dashboard",
        groupIds: [ADMINISTRATORS.id, MARKETING.id],
      },
    ];

    it("splits the dropdown into the given and other sections instead of the pinned divider", async () => {
      setup([ALL_USERS.id], { sections: SECTIONS });

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
      await screen.findByRole("option", { name: "Marketing" });

      // Administrators and Marketing sit in the listed section...
      const accessSection = "Can view this dashboard";
      expect(
        getSection(accessSection).getByRole("option", {
          name: "Administrators",
        }),
      ).toBeInTheDocument();
      expect(
        getSection(accessSection).getByRole("option", { name: "Marketing" }),
      ).toBeInTheDocument();

      // ...while All Users and Sales fall under "Other groups".
      expect(
        getSection("Other groups").getByRole("option", { name: "All Users" }),
      ).toBeInTheDocument();
      expect(
        getSection("Other groups").getByRole("option", { name: "Sales" }),
      ).toBeInTheDocument();

      // The sections replace the flat layout's pinned divider.
      expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    });

    it("omits a section none of whose groups are visible", async () => {
      setup([ALL_USERS.id], {
        groups: [ALL_USERS, MARKETING],
        sections: [{ label: "Can view this dashboard", groupIds: [SALES.id] }],
      });

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
      await screen.findByRole("option", { name: "Marketing" });

      expect(
        screen.queryByRole("group", { name: "Can view this dashboard" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "Other groups" }),
      ).toBeInTheDocument();
    });

    it("omits the other-groups section when every group is claimed", async () => {
      setup([ALL_USERS.id], {
        sections: [
          {
            label: "Can view this dashboard",
            groupIds: GROUPS.map((group) => group.id),
          },
        ],
      });

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
      await screen.findByRole("option", { name: "Marketing" });

      expect(
        screen.getByRole("group", { name: "Can view this dashboard" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("group", { name: "Other groups" }),
      ).not.toBeInTheDocument();
    });

    it("renders multiple sections in order, each group counting toward the first that lists it", async () => {
      setup([ALL_USERS.id], {
        sections: [
          { label: "First", groupIds: [MARKETING.id] },
          // Marketing is already claimed by "First", so only Sales lands here.
          { label: "Second", groupIds: [MARKETING.id, SALES.id] },
        ],
      });

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
      await screen.findByRole("option", { name: "Marketing" });

      // getAllByRole returns DOM order, pinning the section sequence.
      expect(
        screen
          .getAllByRole("group")
          .map((section) => section.getAttribute("aria-label")),
      ).toEqual(["First", "Second", "Other groups"]);

      // Marketing renders once, in "First"; "Second" only gets Sales.
      expect(screen.getAllByRole("option", { name: "Marketing" })).toHaveLength(
        1,
      );
      expect(
        getSection("First").getByRole("option", { name: "Marketing" }),
      ).toBeInTheDocument();
      expect(
        getSection("Second").getByRole("option", { name: "Sales" }),
      ).toBeInTheDocument();
      expect(
        getSection("Other groups").getByRole("option", { name: "All Users" }),
      ).toBeInTheDocument();
    });
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

    it("calls onToggleManager when the dropdown toggle is clicked", async () => {
      const { onToggleManager } = setup([ALL_USERS.id, MARKETING.id]);

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));

      // The toggle only shows for eligible selected groups (Marketing).
      await userEvent.click(
        await screen.findByRole("button", { name: "Turn into Manager" }),
      );

      expect(onToggleManager).toHaveBeenCalledWith(MARKETING.id);
    });

    it("un-tags a manager's pill when demoted via the dropdown toggle", async () => {
      const { onToggleManager } = setup([ALL_USERS.id, MARKETING.id], {
        managerGroupIds: [MARKETING.id],
      });

      // The pill starts tagged as a manager.
      expect(getPills().getByText("Marketing (Manager)")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
      await userEvent.click(
        await screen.findByRole("button", { name: "Turn into Member" }),
      );

      expect(onToggleManager).toHaveBeenCalledWith(MARKETING.id);
      // Demotion drops the tag, leaving a plain pill.
      expect(await getPills().findByText("Marketing")).toBeInTheDocument();
      expect(
        getPills().queryByText("Marketing (Manager)"),
      ).not.toBeInTheDocument();
    });
  });

  describe("with tenants (EE)", () => {
    beforeEach(() => {
      mockSettings({
        "token-features": createMockTokenFeatures({ tenants: true }),
      });
      setupEnterprisePlugins();
    });

    it("sorts the external default group above custom groups regardless of input order", async () => {
      // Input order puts the custom group first to prove the pinned default floats up.
      setup([ALL_TENANT_USERS.id], {
        groups: [CONTRACTORS, ALL_TENANT_USERS],
      });

      await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
      await screen.findByRole("option", { name: "Contractors" });

      // "All tenant users" is pinned, so it leads with the divider before Contractors.
      expectSingleDividerBetween("All tenant users", "Contractors");
    });
  });
});
