import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FormProvider } from "metabase/forms";

import GroupMappingsWidget from "./GroupMappingsWidget";

const defaultGroups = [{ id: 1, name: "Administrators", member_count: 1 }];
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
    <FormProvider initialValues={{}} onSubmit={() => {}}>
      <GroupMappingsWidget
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

describe("GroupMappingsWidget", () => {
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
