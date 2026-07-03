import { userApi } from "metabase/api";
import type { DispatchFn } from "metabase/redux";
import type { InviteInfo, State } from "metabase/redux/store";

import { submitUserInvite } from "./actions";

const { trackUserInvited } = jest.requireMock("metabase/common/analytics");
const mockCreateUser = jest.fn();
userApi.endpoints.createUser.initiate = mockCreateUser;

const mockInviteInfo: InviteInfo = {
  email: "john@doe.com",
  first_name: "John",
  last_name: "Smith",
};

describe("submitUserInvite", () => {
  let dispatch: DispatchFn;
  let getState: () => State;

  beforeEach(() => {
    dispatch = jest.fn();
    getState = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should dispatch createUser with correct parameters", async () => {
    const thunk = submitUserInvite(mockInviteInfo);
    await thunk(dispatch, getState, undefined);
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining(mockInviteInfo),
    );
  });

  it("should handle invite params properly", async () => {
    const incompleteInviteInfo: InviteInfo = {
      email: "test@example.com",
      first_name: null,
      last_name: null,
    };
    const thunk = submitUserInvite(incompleteInviteInfo);

    await thunk(dispatch, getState, undefined);

    expect(mockCreateUser).toHaveBeenCalledWith({
      email: "test@example.com",
      first_name: undefined,
      last_name: undefined,
      source: "setup",
    });
  });

  it("tracks user_invited from setup when the create succeeds", async () => {
    (dispatch as unknown as jest.Mock).mockReturnValue({
      unwrap: () => Promise.resolve(),
    });

    const thunk = submitUserInvite(mockInviteInfo);
    await thunk(dispatch, getState, undefined);

    expect(trackUserInvited).toHaveBeenCalledWith({
      triggeredFrom: "setup",
      targetId: null,
      result: "success",
      eventDetail: "new_user",
    });
    expect(trackUserInvited).toHaveBeenCalledTimes(1);
  });
});
