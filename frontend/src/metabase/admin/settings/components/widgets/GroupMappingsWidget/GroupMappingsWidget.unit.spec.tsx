import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { FormProvider } from "metabase/forms";
import type { GroupId, GroupInfo } from "metabase-types/api";
import { createMockGroup } from "metabase-types/api/mocks";

import { GroupMappingsWidgetView } from "./GroupMappingsWidgetView";

const defaultGroups: GroupInfo[] = [
  createMockGroup({
    id: 1,
    name: "Administrators",
    member_count: 1,
    magic_group_type: "admin",
  }),
];
const defaultMappings: Record<string, GroupId[]> = {
  "group=Administrators": [1],
};

type SetupOptions = {
  mappings?: Record<string, GroupId[]>;
  mappingSetting?: string;
  clearGroupMember?: jest.Mock;
  deleteGroup?: jest.Mock;
  updateSetting?: jest.Mock;
  setting?: { key: string; value: boolean };
  groups?: GroupInfo[];
};

const setup = ({
  mappings = defaultMappings,
  mappingSetting = "ldap-group-mappings",
  clearGroupMember = jest.fn(),
  deleteGroup = jest.fn(),
  updateSetting = jest.fn(),
  setting = { key: "key", value: true },
  groups = defaultGroups,
}: SetupOptions = {}) => {
  return renderWithProviders(
    <FormProvider
      initialValues={{ [setting.key]: setting.value }}
      onSubmit={() => {}}
    >
      <GroupMappingsWidgetView
        groupHeading=""
        groupPlaceholder=""
        allGroups={groups}
        mappings={mappings}
        mappingSetting={mappingSetting}
        setting={setting}
        clearGroupMember={clearGroupMember}
        deleteGroup={deleteGroup}
        updateSetting={updateSetting}
      />
    </FormProvider>,
    { withUndos: true },
  );
};

describe("GroupMappingsWidgetView", () => {
  describe("tooltip text", () => {
    it("shows JWT-specific tooltip text when mappingSetting is jwt-group-mappings", async () => {
      setup({ mappingSetting: "jwt-group-mappings" });

      const aboutMappingsElement = await screen.findByText("About mappings");
      await userEvent.hover(aboutMappingsElement);

      expect(
        await screen.findByText(
          /If no mappings are defined, groups will automatically be assigned based on exactly matching names/,
        ),
      ).toBeInTheDocument();
    });

    it("shows default tooltip text when mappingSetting is not jwt-group-mappings", async () => {
      setup({ mappingSetting: "ldap-group-mappings" });

      const aboutMappingsElement = await screen.findByText("About mappings");
      await userEvent.hover(aboutMappingsElement);

      expect(
        await screen.findByText(
          /If a group isn‘t mapped, its membership won‘t be synced/,
        ),
      ).toBeInTheDocument();
    });
  });

  describe("no mappings message", () => {
    it("shows JWT-specific message when mappingSetting is jwt-group-mappings and sync is enabled", async () => {
      setup({
        mappingSetting: "jwt-group-mappings",
        mappings: {},
        setting: { key: "jwt-group-sync", value: true },
      });

      expect(
        await screen.findByText(
          "No mappings yet, groups will be automatically assigned by exactly matching names",
        ),
      ).toBeInTheDocument();
    });

    it("shows default message when mappingSetting is jwt-group-mappings but sync is disabled", async () => {
      setup({
        mappingSetting: "jwt-group-mappings",
        mappings: {},
        setting: { key: "jwt-group-sync", value: false },
      });

      expect(
        await screen.findByText("No mappings yet, group sync is not on"),
      ).toBeInTheDocument();
    });

    it("shows default message when mappingSetting is not jwt-group-mappings", async () => {
      setup({
        mappingSetting: "ldap-group-mappings",
        mappings: {},
      });

      expect(await screen.findByText("No mappings yet")).toBeInTheDocument();
    });

    it("hides the table column headers when there are no mappings", async () => {
      setup({ mappings: {} });

      expect(await screen.findByText("No mappings yet")).toBeInTheDocument();
      expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    });

    it("shows the table column headers once a mapping exists", async () => {
      setup({ mappingSetting: "ldap-group-mappings" });

      expect(
        await screen.findByRole("columnheader", { name: "Groups" }),
      ).toBeInTheDocument();
    });
  });

  describe("adding a mapping", () => {
    it("adds a mapping with a unique name on Enter", async () => {
      const updateSettingSpy = jest.fn();
      setup({ updateSetting: updateSettingSpy });

      await userEvent.click(
        await screen.findByRole("button", { name: "New mapping" }),
      );
      await userEvent.type(
        screen.getByLabelText("New group mapping name"),
        "cn=People{Enter}",
      );

      await waitFor(() => {
        expect(updateSettingSpy).toHaveBeenCalledWith({
          key: "ldap-group-mappings",
          value: { "group=Administrators": [1], "cn=People": [] },
        });
      });

      // the mapping autosaves, so the user gets a toast confirming it
      expect(await screen.findByText("Mapping added")).toBeInTheDocument();
    });

    it("does not add a mapping with a duplicate name on Enter", async () => {
      const updateSettingSpy = jest.fn();
      setup({ updateSetting: updateSettingSpy });

      await userEvent.click(
        await screen.findByRole("button", { name: "New mapping" }),
      );
      await userEvent.type(
        screen.getByLabelText("New group mapping name"),
        "group=Administrators{Enter}",
      );

      expect(updateSettingSpy).not.toHaveBeenCalled();
    });
  });

  describe("when a mapping is set for admin group", () => {
    it("handles deleting mapping", async () => {
      const updateSettingSpy = jest.fn();
      setup({ updateSetting: updateSettingSpy });

      expect(
        await screen.findByText("group=Administrators"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Admin")).toBeInTheDocument();

      // Click on button to delete mapping
      await userEvent.click(await screen.findByLabelText("close icon"));

      // Confirm remove
      await userEvent.click(screen.getByText("Yes"));

      await waitFor(() => {
        expect(updateSettingSpy).toHaveBeenCalledTimes(1);
      });

      expect(await screen.findByText("Mapping deleted")).toBeInTheDocument();
    });
  });

  describe("when a mapping is set for more than one group", () => {
    const mappings: Record<string, GroupId[]> = { "cn=People": [3, 4] };

    // magic_group_type: null so these aren't filtered out by isDefaultGroup.
    const groups = [
      createMockGroup({
        id: 1,
        name: "All Users",
        member_count: 5,
        magic_group_type: null,
      }),
      createMockGroup({
        id: 2,
        name: "Administrators",
        member_count: 1,
        magic_group_type: null,
      }),
      createMockGroup({
        id: 3,
        name: "Group 1",
        member_count: 2,
        magic_group_type: null,
      }),
      createMockGroup({
        id: 4,
        name: "Group 2",
        member_count: 2,
        magic_group_type: null,
      }),
    ];

    it("handles clearing mapped groups after deleting mapping", async () => {
      const clearGroupMemberSpy = jest.fn();
      setup({ groups, mappings, clearGroupMember: clearGroupMemberSpy });

      expect(await screen.findByText("cn=People")).toBeInTheDocument();
      expect(await screen.findByText("2 other groups")).toBeInTheDocument();

      // Click on button to delete mapping
      await userEvent.click(await screen.findByLabelText("close icon"));

      await userEvent.click(
        screen.getByLabelText(/Also remove all group members/i),
      );
      await userEvent.click(
        await screen.findByRole("button", {
          name: "Remove mapping and members",
        }),
      );

      await waitFor(() => {
        // One call for each group deleted
        expect(clearGroupMemberSpy).toHaveBeenCalledTimes(2);
      });
    });

    it("handles deleting mapped groups after deleting mapping", async () => {
      const deleteGroupSpy = jest.fn();
      setup({ groups, mappings, deleteGroup: deleteGroupSpy });

      expect(await screen.findByText("cn=People")).toBeInTheDocument();
      expect(await screen.findByText("2 other groups")).toBeInTheDocument();

      // Click on button to delete mapping
      await userEvent.click(await screen.findByLabelText("close icon"));

      await userEvent.click(screen.getByLabelText(/Also delete the groups/i));
      await userEvent.click(
        await screen.findByRole("button", {
          name: "Remove mapping and delete groups",
        }),
      );

      await waitFor(() => {
        // One call for each group deleted
        expect(deleteGroupSpy).toHaveBeenCalledTimes(2);
      });
    });
  });
});
