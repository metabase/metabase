import { createMockUser } from "metabase-types/api/mocks";
import { getUserDisplayName } from "./user-name";

const TEST_USER_COMMON_NAME = createMockUser();
const TEST_USER_WITHOUT_COMMON_NAME = createMockUser({
  common_name: undefined,
  first_name: "Bobby",
  last_name: "Tables",
});

describe("getUserDisplayName", () => {
  it("should return the common_name when it exists", () => {
    const displayName = getUserDisplayName(TEST_USER_COMMON_NAME);

    expect(displayName).toBe("Testy Tableton");
  });

  it("should return the combination of first_name and last_name when common_name is missing", () => {
    const displayName = getUserDisplayName(TEST_USER_WITHOUT_COMMON_NAME);

    expect(displayName).toBe("Bobby Tables");
  });
});
