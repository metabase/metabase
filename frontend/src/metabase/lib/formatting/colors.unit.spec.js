import { color } from "metabase/lib/colors";

import { assignUserColors } from "./colors";

describe("lib/formatting/colors", () => {
  it("should assign colors to users when currentUserId is passed", () => {
    const userIds = [1, 2, 3];
    const currentUserId = 1;

    const userColors = assignUserColors(userIds, currentUserId);

    const expectedAssignedColors = {
      1: color("brand"),
      2: color("accent2"),
      3: color("error"),
    };

    expect(userColors).toMatchObject(expectedAssignedColors);
  });

  it("should assign colors to users when currentUserId is null", () => {
    const userIds = [1, 2, 3];
    const currentUserId = null;

    const userColors = assignUserColors(userIds, currentUserId);

    const expectedAssignedColors = {
      1: color("accent2"),
      2: color("error"),
      3: color("accent1"),
    };

    expect(userColors).toMatchObject(expectedAssignedColors);
  });
});
