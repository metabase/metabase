import type { State } from "metabase-types/store";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { useDispatch, useSelector } from "./hooks";

const DEFAULT_USER = createMockUser({ email: undefined });
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

      setup({ thunk: () => () => funcInThunk() });
      expect(funcInThunk).toHaveBeenCalled();
    });

    it("should properly dispatch thunks that use `getState`", () => {
      const foundEmailState = jest.fn();
      const didNotFindEmailState = jest.fn();

      setup({
        thunk: () => (_dispatch: any, getState: () => State) => {
          const email = getState().currentUser?.email;
          email ? foundEmailState() : didNotFindEmailState();
        },
      });
      expect(foundEmailState).toHaveBeenCalled();
      expect(didNotFindEmailState).not.toHaveBeenCalled();
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
