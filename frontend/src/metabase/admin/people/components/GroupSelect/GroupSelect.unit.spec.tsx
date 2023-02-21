import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import GroupSelect from "./GroupSelect";

const adminGroup = { id: 2, name: "Administrators", member_count: 1 };

const setup = ({ groups = [adminGroup], selectedGroupIds = [] } = {}) => {
  const onGroupChangeSpy = jest.fn();

  render(
    <GroupSelect
      groups={groups}
      selectedGroupIds={selectedGroupIds}
      onGroupChange={onGroupChangeSpy}
    />,
  );

  return { onGroupChangeSpy };
};

describe("GroupSelect", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("when only the Administrators group is passed", () => {
    it("should not show a Groups section (metabase#27728)", () => {
      setup();

      userEvent.click(screen.getByText("Default"));

      expect(screen.queryByText("Groups")).not.toBeInTheDocument();
    });

    it("should allow you to select the Administrators group", () => {
      const { onGroupChangeSpy } = setup();

      userEvent.click(screen.getByText("Default"));
      userEvent.click(screen.getByText("Administrators"));

      expect(onGroupChangeSpy).toHaveBeenCalledTimes(1);
      expect(onGroupChangeSpy).toHaveBeenCalledWith(adminGroup, true);
    });
  });
});
