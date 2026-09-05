import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { canAccessEmbeddingHub } from "./selectors";

jest.mock("metabase/utils/iframe", () => ({
  isWithinIframe: jest.fn(() => false),
}));

const { isWithinIframe } = jest.requireMock("metabase/utils/iframe");

describe("canAccessEmbeddingHub", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessEmbeddingHub(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessEmbeddingHub(state)).toBe(true);
  });

  it("returns false when user is not an admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: false }),
    });

    expect(canAccessEmbeddingHub(state)).toBe(false);
  });
});
