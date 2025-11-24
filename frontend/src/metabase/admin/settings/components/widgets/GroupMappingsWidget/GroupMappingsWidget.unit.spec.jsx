import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";
import { FormProvider } from "metabase/forms";
import { createMockGroup } from "metabase-types/api/mocks";

import { GroupMappingsWidgetView } from "./GroupMappingsWidgetView";

const defaultGroups = [
  createMockGroup({
    id: 1,
    name: "Administrators",
    member_count: 1,
    magic_group_type: "admin",
  }),
];
const defaultMappings = { "group=Administrators": [1] };

const setup = ({
  mappings = defaultMappings,
  mappingSetting = "ldap-group-mappings",
  clearGroupMember = jest.fn(),
  deleteGroup = jest.fn(),
  updateSetting = jest.fn(),
  onSuccess = jest.fn(),
  setting = { key: "key", value: true },
  groups = defaultGroups,
} = {}) => {
  render(
    <FormProvider
      initialValues={{ [setting.key]: setting.value }}
      onSubmit={() => {}}
    >
      <GroupMappingsWidgetView
        allGroups={groups}
        mappings={mappings}
        mappingSetting={mappingSetting}
        setting={setting}
        clearGroupMember={clearGroupMember}
        deleteGroup={deleteGroup}
        updateSetting={updateSetting}
        onSuccess={onSuccess}
      />
    </FormProvider>,
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
          /Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server\. If no mappings are defined, groups will automatically be assigned based on exactly matching names\./,
        ),
      ).toBeInTheDocument();
    });

    it("shows default tooltip text when mappingSetting is not jwt-group-mappings", async () => {
      setup({ mappingSetting: "ldap-group-mappings" });

      const aboutMappingsElement = await screen.findByText("About mappings");
      await userEvent.hover(aboutMappingsElement);

      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        /Mappings allow Metabase to automatically add and remove users from groups based on the membership information provided by the directory server/,
      );
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
    });
  });

  describe("when a mapping is set for more than one group", () => {
    const mappings = { "cn=People": [3, 4] };

    const groups = [
      { id: 1, name: "All Users", member_count: 5 },
      { id: 2, name: "Administrators", member_count: 1 },
      { id: 3, name: "Group 1", member_count: 2 },
      { id: 4, name: "Group 2", member_count: 2 },
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
