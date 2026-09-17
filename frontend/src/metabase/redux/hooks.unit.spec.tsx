import { createMockAppState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { State } from "metabase/redux/store";

import { useDispatch, useSelector } from "./hooks";

const getIsDndAvailable = (state: State) => state.app.isDndAvailable;

describe("useSelector", () => {
  it("should allow access to redux store", () => {
    const Component = () => {
      const isDndAvailable = useSelector((state) => getIsDndAvailable(state));
      return <>{isDndAvailable ? "Dnd available" : "Dnd unavailable"}</>;
    };

    renderWithProviders(<Component />, {
      storeInitialState: {
        app: createMockAppState({ isDndAvailable: false }),
      },
    });
    expect(screen.getByText("Dnd unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Dnd available")).not.toBeInTheDocument();
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
      const foundDndState = jest.fn();
      const didNotFindDndState = jest.fn();

      setup({
        thunk: () => (_dispatch: any, getState: () => State) => {
          if (getIsDndAvailable(getState())) {
            foundDndState();
          } else {
            didNotFindDndState();
          }
        },
      });
      expect(foundDndState).toHaveBeenCalled();
      expect(didNotFindDndState).not.toHaveBeenCalled();
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
