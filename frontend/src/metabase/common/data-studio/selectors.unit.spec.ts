import { createMockState } from "__support__/state";
import { createMockUser } from "metabase-types/api/mocks";

import { canAccessDataStudio } from "./selectors";

jest.mock("metabase/utils/iframe", () => ({
  isWithinIframe: jest.fn(() => false),
}));

const { isWithinIframe } = jest.requireMock("metabase/utils/iframe");

describe("canAccessDataStudio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessDataStudio(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: true,
        is_data_analyst: false,
      }),
    });

    expect(canAccessDataStudio(state)).toBe(true);
  });

  it("returns true when user is analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessDataStudio(state)).toBe(true);
  });

  it("returns false when user is neither admin nor analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
      }),
    });

    expect(canAccessDataStudio(state)).toBe(false);
  });
});
