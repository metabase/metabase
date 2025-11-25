import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { Route } from "react-router";

import { act, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";

import { useConfirmOnRouteLeave } from "./useConfirmOnRouteLeave";

const ConfirmingPage = () => {
  const [showConfirm, setShowConfirm] = useState(false);
  const onConfirmRef = useRef<(() => void) | null>(null);

  useConfirmOnRouteLeave({
    shouldConfirm: true,
    // Use a simple async-like confirmation UI (not window.confirm)
    confirm: (onConfirm) => {
      onConfirmRef.current = onConfirm;
      setShowConfirm(true);
    },
  });

  return (
    <div>
      <div>Form B</div>
      {showConfirm && (
        <div role="dialog">
          <div>Are you sure you want to leave?</div>
          <button
            onClick={() => {
              onConfirmRef.current?.();
              setShowConfirm(false);
            }}
          >
            Yes
          </button>
          <button onClick={() => setShowConfirm(false)}>No</button>
        </div>
      )}
    </div>
  );
};

const PageA = () => <div>Page A</div>;

describe("useConfirmOnRouteLeave", () => {
  const setup = () =>
    renderWithProviders(
      <div>
        <Route path="/a" component={PageA} />
        <Route path="/b" component={ConfirmingPage} />
      </div>,
      { withRouter: true, initialRoute: "/a" },
    );

  // Shared happy-path to the confirmation dialog after attempting to leave /b
  const navigateToBAndTriggerBack = async (history: any) => {
    const guardedHistory = checkNotNull(history);

    // Navigate to /b to create a history entry to go back from
    act(() => {
      guardedHistory.push("/b");
    });

    // Ensure we're on /b
    await screen.findByText("Form B");
    expect(guardedHistory.getCurrentLocation().pathname).toBe("/b");

    // Simulate browser back, which should trigger confirmation and roll URL forward
    act(() => {
      guardedHistory.goBack();
    });

    await screen.findByRole("dialog");
    expect(guardedHistory.getCurrentLocation().pathname).toBe("/b");

    return guardedHistory;
  };

  it("shows confirmation on browser back and stays on the same route when clicking 'No' (URL unchanged)", async () => {
    const { history } = setup();

    const guardedHistory = await navigateToBAndTriggerBack(history);

    // Click "No" to cancel navigation
    await userEvent.click(screen.getByText("No"));

    // We must still be on the same route and URL
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Form B")).toBeInTheDocument();
    expect(guardedHistory.getCurrentLocation().pathname).toBe("/b");
  });

  it("navigates to the previous route when clicking 'Yes' in the confirmation", async () => {
    const { history } = setup();

    const guardedHistory = await navigateToBAndTriggerBack(history);

    // Confirm leaving
    await userEvent.click(screen.getByText("Yes"));

    // We should navigate to /a
    await screen.findByText("Page A");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(guardedHistory.getCurrentLocation().pathname).toBe("/a");
  });
});
