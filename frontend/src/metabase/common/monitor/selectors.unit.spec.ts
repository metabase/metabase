import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import { canAccessMonitor } from "./selectors";

jest.mock("metabase/selectors/embed", () => ({
  getIsEmbeddingIframe: jest.fn(() => false),
}));

const { getIsEmbeddingIframe } = jest.requireMock("metabase/selectors/embed");

describe("canAccessMonitor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIsEmbeddingIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    getIsEmbeddingIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessMonitor(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: true,
        is_data_analyst: false,
      }),
    });

    expect(canAccessMonitor(state)).toBe(true);
  });

  it("returns true when user is analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessMonitor(state)).toBe(true);
  });

  it("returns false when user is neither admin nor analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
      }),
    });

    expect(canAccessMonitor(state)).toBe(false);
  });
});
