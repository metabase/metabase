import type { History } from "history";
import { Route } from "react-router";

import { act, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";

import { useConfirmOnRouteLeave } from "./useConfirmOnRouteLeave";

const confirmResult = jest.fn();

const PageB = () => {
  useConfirmOnRouteLeave({
    shouldConfirm: true,
    confirm: (onConfirm: () => void) => {
      if (confirmResult()) {
        onConfirm();
      }
    },
  });

  return <div>Page B</div>;
};

describe("useConfirmOnRouteLeave", () => {
  const setup = () => {
    const PageA = () => <div>Page A</div>;

    const { history, ...rest } = renderWithProviders(
      <div>
        <Route path="/a" component={PageA} />
        <Route path="/b" component={PageB} />
      </div>,
      { withRouter: true, initialRoute: "/a" },
    );
    const guardedHistory = checkNotNull(history);
    return {
      ...rest,
      history: guardedHistory,
    };
  };

  // Shared happy path for remaining on the /b route after an attempted exit
  const navigateToBAndTriggerBack = (history: History) => {
    // Navigate to /b to create a history entry to go back from
    act(() => history.push("/b"));

    // Ensure we're on /b
    expect(screen.getByText("Page B")).toBeInTheDocument();
    expect(history.getCurrentLocation().pathname).toBe("/b");

    // Simulate browser back, which should trigger confirmation and roll URL forward
    act(() => history.goBack());
  };

  it("shows confirmation on browser back and stays on the same route when clicking 'No' (URL unchanged)", () => {
    const { history } = setup();
    // Do not confirm
    confirmResult.mockReturnValue(false);

    // try to leave a page
    navigateToBAndTriggerBack(history);

    // We must still be on the same route and URL
    expect(screen.getByText("Page B")).toBeInTheDocument();
    expect(history.getCurrentLocation().pathname).toBe("/b");
  });

  it("navigates to the previous route when clicking 'Yes' in the confirmation", () => {
    const { history } = setup();

    // Do confirm
    confirmResult.mockReturnValue(true);

    // try to leave a page
    navigateToBAndTriggerBack(history);

    // We should navigate to /a
    expect(screen.getByText("Page A")).toBeInTheDocument();
    expect(history.getCurrentLocation().pathname).toBe("/a");
  });
});
