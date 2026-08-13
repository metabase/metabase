import type { TestRouter } from "__support__/ui";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
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

    const { router, ...rest } = renderWithProviders(
      <>
        <Route path="/a" element={<PageA />} />
        <Route path="/b" element={<PageB />} />
      </>,
      { withRouter: true, initialRoute: "/a" },
    );
    return {
      ...rest,
      router: checkNotNull(router),
    };
  };

  // Shared happy path for remaining on the /b route after an attempted exit
  const navigateToBAndTriggerBack = (router: TestRouter) => {
    // Navigate to /b to create a history entry to go back from
    act(() => router.navigate("/b"));

    // Ensure we're on /b
    expect(screen.getByText("Page B")).toBeInTheDocument();
    expect(router.location.pathname).toBe("/b");

    // Simulate browser back. The router parks the navigation and asks for
    // confirmation, so the URL stays on /b until the answer comes back.
    act(() => router.back());
  };

  it("shows confirmation on browser back and stays on the same route when clicking 'No' (URL unchanged)", () => {
    const { router } = setup();
    // Do not confirm
    confirmResult.mockReturnValue(false);

    // try to leave a page
    navigateToBAndTriggerBack(router);

    // We must still be on the same route and URL
    expect(screen.getByText("Page B")).toBeInTheDocument();
    expect(router.location.pathname).toBe("/b");
  });

  it("navigates to the previous route when clicking 'Yes' in the confirmation", async () => {
    const { router } = setup();

    // Do confirm
    confirmResult.mockReturnValue(true);

    // try to leave a page
    navigateToBAndTriggerBack(router);

    // We should navigate to /a. The router resumes the parked navigation itself,
    // which it does asynchronously.
    expect(await screen.findByText("Page A")).toBeInTheDocument();
    await waitFor(() => expect(router.location.pathname).toBe("/a"));
  });
});
