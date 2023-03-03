import React from "react";
import fetchMock from "fetch-mock";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GroupMappingsWidget from "./GroupMappingsWidget";

const setup = ({
  mappingSetting = "ldap-group-mappings",
  onChangeSetting = jest.fn(),
  onSuccess = jest.fn(),
  setting = { value: true },
} = {}) => {
  render(
    <GroupMappingsWidget
      mappingSetting={mappingSetting}
      setting={setting}
      onChangeSetting={onChangeSetting}
      onSuccess={onSuccess}
    />,
  );
};

describe("GroupMappingsWidget", () => {
  describe("when a mapping is set for admin group", () => {
    const settingBody = [
      {
        key: "ldap-group-mappings",
        value: { "cn=People": [2] },
      },
    ];

    const groupsBody = [{ id: 2, name: "Administrators", member_count: 1 }];

    beforeEach(() => {
      fetchMock.get("path:/api/setting", settingBody);
      fetchMock.get("path:/api/permissions/group", groupsBody);
      fetchMock.put("path:/api/setting/ldap-group-mappings", 200);
    });

    it("handles deleting mapping", async () => {
      const onChangeSettingSpy = jest.fn();
      setup({ onChangeSetting: onChangeSettingSpy });

      expect(await screen.findByText("cn=People")).toBeInTheDocument();
      expect(await screen.findByText("Admin")).toBeInTheDocument();

      // Click on button to delete mapping
      userEvent.click(await screen.findByLabelText("close icon"));

      // Confirm remove
      userEvent.click(screen.getByText("Yes"));

      await waitFor(() => {
        expect(onChangeSettingSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("when a mapping is set for more than one group", () => {
    const settingBody = [
      {
        key: "ldap-group-mappings",
        value: { "cn=People": [3, 4] },
      },
    ];

    const groupsBody = [
      { id: 1, name: "All Users", member_count: 5 },
      { id: 2, name: "Administrators", member_count: 1 },
      { id: 3, name: "Group 1", member_count: 2 },
      { id: 4, name: "Group 2", member_count: 2 },
    ];

    beforeEach(() => {
      fetchMock.getOnce(
        { url: "path:/api/setting", overwriteRoutes: false },
        settingBody,
      );
      fetchMock.getOnce(
        { url: "path:/api/setting", overwriteRoutes: false },
        [],
      );
      fetchMock.put("path:/api/setting/ldap-group-mappings", 200);
      fetchMock.get("path:/api/permissions/group", groupsBody);
    });

    it("handles clearing mapped groups after deleting mapping", async () => {
      fetchMock.put("path:/api/permissions/membership/3/clear", 200);
      fetchMock.put("path:/api/permissions/membership/4/clear", 200);

      setup();

      expect(await screen.findByText("cn=People")).toBeInTheDocument();
      expect(await screen.findByText("2 other groups")).toBeInTheDocument();

      // Click on button to delete mapping
      userEvent.click(await screen.findByLabelText("close icon"));

      userEvent.click(screen.getByLabelText(/Also remove all group members/i));
      userEvent.click(
        await screen.findByRole("button", {
          name: "Remove mapping and members",
        }),
      );

      expect(await screen.findByText("No mappings yet")).toBeInTheDocument();
    });

    it("handles deleting mapped groups after deleting mapping", async () => {
      fetchMock.delete("path:/api/permissions/group/3", 200);
      fetchMock.delete("path:/api/permissions/group/4", 200);
      setup();

      expect(await screen.findByText("cn=People")).toBeInTheDocument();
      expect(await screen.findByText("2 other groups")).toBeInTheDocument();

      // Click on button to delete mapping
      userEvent.click(await screen.findByLabelText("close icon"));

      userEvent.click(screen.getByLabelText(/Also delete the groups/i));
      userEvent.click(
        await screen.findByRole("button", {
          name: "Remove mapping and delete groups",
        }),
      );

      expect(await screen.findByText("No mappings yet")).toBeInTheDocument();
    });
  });
});
