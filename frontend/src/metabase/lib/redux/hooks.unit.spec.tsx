import React, { useEffect } from "react";
import type { AnyAction } from "redux";
import type { State } from "metabase-types/store";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { useDispatch, useSelector } from "./hooks";
import type { AppDispatch } from "./hooks";

const DEFAULT_USER = createMockUser({ email: undefined });
const CUSTOM_ACTION_TYPE = "custom_action_type_for_test";
const TEST_EMAIL = "test_email@metabase.test";

describe("useSelector", () => {
  it("should allow access to redux store", () => {
    const Component = () => {
      const email = useSelector(state => state.currentUser?.email);
      return <>{email || "No email found"}</>;
    };

    renderWithProviders(<Component />, {
      storeInitialState: {
        currentUser: { ...DEFAULT_USER, email: TEST_EMAIL },
      },
    });
    expect(screen.getByText(TEST_EMAIL)).toBeInTheDocument();
    expect(screen.queryByText("No email found")).not.toBeInTheDocument();
  });
});

describe("useDispatch", () => {
  describe("thunk", () => {
    function setup({
      thunk,
    }: {
      thunk: () => (dispatch: any, getState: () => State) => void;
    }) {
      const Component = () => {
        const dispatch = useDispatch();
        dispatch(thunk());
        return <></>;
      };

      renderWithProviders(<Component />);
    }

    it("should provide a `dispatch` method that can dispatch a thunk", () => {
      const funcInThunk = jest.fn();

      setup({ thunk: () => (dispatch: any, getState: any) => funcInThunk() });
      expect(funcInThunk).toHaveBeenCalled();
    });

    it("should properly dispatch thunks that use `getState`", () => {
      const foundEmailState = jest.fn();
      const didNotFindEmailState = jest.fn();

      setup({
        thunk: () => (dispatch: any, getState: () => State) => {
          const email = getState().currentUser?.email;
          email ? foundEmailState() : didNotFindEmailState();
        },
      });
      expect(foundEmailState).toHaveBeenCalled();
      expect(didNotFindEmailState).not.toHaveBeenCalled();
    });

    it("should properly dispatch thunks that use `dispatch`", () => {
      const funcInNestedThunk = jest.fn();
      const nestedThunk = () => (dispatch: any, getState: any) =>
        funcInNestedThunk();

      setup({
        thunk: () => (dispatch: (thunk: any) => void, getState: any) =>
          dispatch(nestedThunk()),
      });
      expect(funcInNestedThunk).toHaveBeenCalled();
    });
  });

  describe("dispatch.action", () => {
    function setup({ effect }: { effect: (dispatch: AppDispatch) => void }) {
      const customReducer = (
        state: State["currentUser"],
        action: AnyAction,
      ): State["currentUser"] => {
        if (action.type !== CUSTOM_ACTION_TYPE) {
          return state || DEFAULT_USER;
        }
        return { ...(state || DEFAULT_USER), email: action.payload.email };
      };
      const customReducers = { currentUser: customReducer };

      const Component = () => {
        const dispatch = useDispatch();
        const email = useSelector(state => state.currentUser?.email);

        useEffect(() => {
          effect(dispatch);
        }, [dispatch]);

        return <>{email || "No email found"}</>;
      };

      renderWithProviders(<Component />, { customReducers });
    }

    it("should allow the use of `dispatch.action`", () => {
      setup({
        effect: dispatch =>
          dispatch.action(CUSTOM_ACTION_TYPE, { email: TEST_EMAIL }),
      });

      expect(screen.getByText(TEST_EMAIL)).toBeInTheDocument();
      expect(screen.queryByText("No email found")).not.toBeInTheDocument();
    });

    it("should properly dispatch thunks that use `dispatch.action`", () => {
      setup({
        effect: dispatch =>
          dispatch(dispatch =>
            dispatch.action(CUSTOM_ACTION_TYPE, {
              email: TEST_EMAIL,
            }),
          ),
      });

      expect(screen.getByText(TEST_EMAIL)).toBeInTheDocument();
      expect(screen.queryByText("No email found")).not.toBeInTheDocument();
    });
  });
});
