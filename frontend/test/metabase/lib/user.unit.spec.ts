import { getFullName } from "metabase/lib/user";
import { createMockUser } from "metabase-types/api/mocks";

describe("lib/user", () => {
  describe("getFullName", () => {
    test("has both first_name and last_name", () => {
      const user = {
        first_name: "Testy",
        last_name: "Tableton",
      };
      expect(getFullName(createMockUser(user))).toEqual("Testy Tableton");
    });

    test("has only first_name", () => {
      const user = {
        first_name: "Testy",
        last_name: null,
      };
      expect(getFullName(createMockUser(user))).toEqual("Testy");
    });

    test("has only last_name", () => {
      const user = {
        first_name: null,
        last_name: "Tableton",
      };
      expect(getFullName(createMockUser(user))).toEqual("Tableton");
    });

    test("has no name", () => {
      const user = {
        first_name: null,
        last_name: null,
      };
      expect(getFullName(createMockUser(user))).toEqual(null);
    });
  });
});
