import { renderWithProviders, screen } from "__support__/ui";
import type { State } from "metabase/redux/store";
import { createMockAppState } from "metabase/redux/store/mocks";

import { useDispatch, useSelector } from "./hooks";

const getIsNavbarOpen = (state: State) => state.app.isNavbarOpen;

describe("useSelector", () => {
  it("should allow access to redux store", () => {
    const Component = () => {
      const isNavbarOpen = useSelector((state) => getIsNavbarOpen(state));
      return <>{isNavbarOpen ? "Navbar open" : "Navbar closed"}</>;
    };

    renderWithProviders(<Component />, {
      storeInitialState: {
        app: createMockAppState({ isNavbarOpen: false }),
      },
    });
    expect(screen.getByText("Navbar closed")).toBeInTheDocument();
    expect(screen.queryByText("Navbar open")).not.toBeInTheDocument();
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

      setup({ thunk: () => () => funcInThunk() });
      expect(funcInThunk).toHaveBeenCalled();
    });

    it("should properly dispatch thunks that use `getState`", () => {
      const foundNavbarOpenState = jest.fn();
      const didNotFindNavbarOpenState = jest.fn();

      setup({
        thunk: () => (_dispatch: any, getState: () => State) => {
          if (getIsNavbarOpen(getState())) {
            foundNavbarOpenState();
          } else {
            didNotFindNavbarOpenState();
          }
        },
      });
      expect(foundNavbarOpenState).toHaveBeenCalled();
      expect(didNotFindNavbarOpenState).not.toHaveBeenCalled();
    });

    it("should properly dispatch thunks that use `dispatch`", () => {
      const funcInNestedThunk = jest.fn();
      const nestedThunk = () => () => funcInNestedThunk();

      setup({
        thunk: () => (dispatch: (thunk: any) => void) =>
          dispatch(nestedThunk()),
      });
      expect(funcInNestedThunk).toHaveBeenCalled();
    });
  });
});
