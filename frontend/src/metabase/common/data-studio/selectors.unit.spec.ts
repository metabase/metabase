import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import type { TokenFeatures, User } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { canAccessDataStudio } from "./selectors";

jest.mock("metabase/utils/iframe", () => ({
  isWithinIframe: jest.fn(() => false),
}));

const { isWithinIframe } = jest.requireMock("metabase/utils/iframe");

const setup = ({
  user,
  tokenFeatures = {},
}: {
  user: Partial<User>;
  tokenFeatures?: Partial<TokenFeatures>;
}) =>
  createMockState({
    currentUser: createMockUser(user),
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

describe("canAccessDataStudio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = setup({
      user: { is_superuser: true },
      tokenFeatures: { advanced_permissions: true },
    });

    expect(canAccessDataStudio(state)).toBe(false);
  });

  it("returns true when user is admin and the feature is present", () => {
    const state = setup({
      user: { is_superuser: true, is_data_analyst: false },
      tokenFeatures: { advanced_permissions: true },
    });

    expect(canAccessDataStudio(state)).toBe(true);
  });

  it("returns true when user is admin and the feature is absent", () => {
    const state = setup({
      user: { is_superuser: true, is_data_analyst: false },
      tokenFeatures: { advanced_permissions: false },
    });

    expect(canAccessDataStudio(state)).toBe(true);
  });

  it("returns true when user is analyst and the feature is present", () => {
    const state = setup({
      user: { is_superuser: false, is_data_analyst: true },
      tokenFeatures: { advanced_permissions: true },
    });

    expect(canAccessDataStudio(state)).toBe(true);
  });

  it("returns false when user is analyst and the feature is absent", () => {
    const state = setup({
      user: { is_superuser: false, is_data_analyst: true },
      tokenFeatures: { advanced_permissions: false },
    });

    expect(canAccessDataStudio(state)).toBe(false);
  });

  it("returns false when user is neither admin nor analyst", () => {
    const state = setup({
      user: { is_superuser: false, is_data_analyst: false },
      tokenFeatures: { advanced_permissions: true },
    });

    expect(canAccessDataStudio(state)).toBe(false);
  });
});
