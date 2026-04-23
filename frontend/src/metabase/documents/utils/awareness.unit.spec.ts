import { createMockUser } from "metabase-types/api/mocks";

import { getAwarenessUser } from "./awareness";
import { userColor } from "./userColor";

describe("getAwarenessUser", () => {
  it("returns the user's common_name and deterministic color", () => {
    const user = createMockUser({ id: 42, common_name: "Crowberto Corv" });
    expect(getAwarenessUser(user)).toEqual({
      name: "Crowberto Corv",
      color: userColor(42),
    });
  });

  it("returns a localized fallback when user is null", () => {
    expect(getAwarenessUser(null)).toEqual({
      name: "User",
      color: "#888888",
    });
  });

  it("returns a localized fallback when user is undefined", () => {
    expect(getAwarenessUser(undefined)).toEqual({
      name: "User",
      color: "#888888",
    });
  });
});
