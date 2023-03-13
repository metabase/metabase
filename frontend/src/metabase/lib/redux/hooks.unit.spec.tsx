import React from "react";
import { State } from "metabase-types/store";

import { renderWithProviders, screen } from "__support__/ui";
import { useDispatch, useSelector } from "./hooks";

describe("useSelector", () => {
  it("should allow access to redux store", () => {
    const Component = () => {
      const email = useSelector(state => state.currentUser?.email);
      return <>{email || "No email found"}</>;
    };

    renderWithProviders(<Component />);
    expect(screen.getByText("user@metabase.test")).toBeInTheDocument();
    expect(screen.queryByText("No email found")).not.toBeInTheDocument();
  });
});

describe("useDispatch", () => {
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
