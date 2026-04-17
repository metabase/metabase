import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { getUserAttributes, getUserIsAdmin } from "./user";

describe("metabase/selectors/user", () => {
  it("should return true if user is an admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(getUserIsAdmin(state)).toBe(true);
  });

  it("should return false if user is not an admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: false }),
    });

    expect(getUserIsAdmin(state)).toBe(false);
  });

  describe("getUserAttributes", () => {
    it("should return user attributes including JWT-sourced attributes", () => {
      const state = createMockState({
        currentUser: createMockUser({
          attributes: { jwt_attr: "jwt_value", manual_attr: "manual_value" },
        }),
      });

      expect(getUserAttributes(state)).toEqual({
        jwt_attr: "jwt_value",
        manual_attr: "manual_value",
      });
    });

    it("should return empty object when attributes is null", () => {
      const state = createMockState({
        currentUser: createMockUser({ attributes: null }),
      });

      expect(getUserAttributes(state)).toEqual({});
    });

    it("should return empty object when no current user", () => {
      const state = createMockState({ currentUser: null });

      expect(getUserAttributes(state)).toEqual({});
    });
  });
});
