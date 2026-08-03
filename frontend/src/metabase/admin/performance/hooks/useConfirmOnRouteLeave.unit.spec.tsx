import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import type { History } from "metabase/router";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";

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
      <>
        <Route path="/a" element={<PageA />} />
        <Route path="/b" element={<PageB />} />
      </>,
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

    // Simulate browser back. The router parks the navigation and asks for
    // confirmation, so the URL stays on /b until the answer comes back.
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

  it("navigates to the previous route when clicking 'Yes' in the confirmation", async () => {
    const { history } = setup();

    // Do confirm
    confirmResult.mockReturnValue(true);

    // try to leave a page
    navigateToBAndTriggerBack(history);

    // We should navigate to /a. The router resumes the parked navigation itself,
    // which it does asynchronously.
    expect(await screen.findByText("Page A")).toBeInTheDocument();
    await waitFor(() =>
      expect(history.getCurrentLocation().pathname).toBe("/a"),
    );
  });
});
