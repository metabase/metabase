import { getUserIsAdmin } from "./user";

describe("metabase/selectors/user", () => {
  it("should return true if user is an admin", () => {
    const state = {
      user: {
        is_superuser: true,
      },
    };

    expect(getUserIsAdmin(state)).toBe(true);
  });

  it("should return false if user is not an admin", () => {
    const state = {
      user: {
        is_superuser: false,
      },
    };

    expect(getUserIsAdmin(state)).toBe(false);
  });
});
