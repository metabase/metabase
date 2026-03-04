import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { canAccessDataStudio } from "./selectors";

jest.mock("metabase/selectors/embed", () => ({
  getIsEmbeddingIframe: jest.fn(() => false),
}));

const { getIsEmbeddingIframe } = jest.requireMock("metabase/selectors/embed");

describe("canAccessDataStudio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIsEmbeddingIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    getIsEmbeddingIframe.mockReturnValue(true);
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
