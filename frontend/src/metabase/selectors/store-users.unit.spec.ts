import {
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { getStoreUsers } from "metabase/selectors/store-users";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

const setupRefreshableProperties = ({
  current_user_matches_store_user,
}: {
  current_user_matches_store_user: boolean;
}) => {
  const settings = createMockSettings({
    "token-status": {
      status: "",
      valid: true,
      features: [],
      "store-users": current_user_matches_store_user
        ? [{ email: "USER@example.com" }]
        : [{ email: "OTHER@example.com" }],
    },
  });
  setupPropertiesEndpoints(settings);
  return settings;
};

const setup = async ({
  current_user_matches_store_user,
}: {
  current_user_matches_store_user: boolean;
}) => {
  const settings = setupRefreshableProperties({
    current_user_matches_store_user,
  });

  const user = createMockUser({ email: "user@example.com" });
  setupCurrentUserEndpoint(user);

  return createMockState({
    settings: createMockSettingsState(settings),
    currentUser: user,
  });
};

describe("useStoreUsers", () => {
  it("user is not store user", async () => {
    const state = await setup({ current_user_matches_store_user: false });
    expect(getStoreUsers(state)).toEqual({
      isStoreUser: false,
      anyStoreUserEmailAddress: "other@example.com",
    });
  });

  it("user is store user", async () => {
    const state = await setup({ current_user_matches_store_user: true });
    expect(getStoreUsers(state)).toEqual({
      isStoreUser: true,
      anyStoreUserEmailAddress: "user@example.com",
    });
  });
});
