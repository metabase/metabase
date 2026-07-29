import { usePrevious } from "react-use";

import { act, renderWithProviders, screen } from "__support__/ui";

import { Route } from "./route";
import { useParams } from "./use-params";
import { withRouteProps } from "./with-route-props";

// Mirrors the document /new -> /new leave prompt: a page that derives transient
// state from `usePrevious(location.key)` and expects to stay rendered until the
// user acts on it. It only holds if a same-path navigation re-renders the page
// exactly once, the way v3 `component` routes did.
const LeavePrompt = ({ location }: { location: { key?: string } }) => {
  const previousKey = usePrevious(location.key);
  const navigatedInPlace =
    previousKey !== undefined && location.key !== previousKey;
  return <div>{navigatedInPlace ? "leave-prompt" : "no-prompt"}</div>;
};

const RoutedLeavePrompt = withRouteProps(LeavePrompt);

const Page = () => {
  const { id } = useParams();
  return <RoutedLeavePrompt key={id} />;
};

describe("router/RouterProvider context stability", () => {
  it("keeps a page's usePrevious(location.key) state after a same-path navigation", async () => {
    const { history } = renderWithProviders(
      <Route path="doc/:id" element={<Page />} />,
      { withRouter: true, initialRoute: "/doc/new" },
    );

    expect(await screen.findByText("no-prompt")).toBeInTheDocument();

    act(() => {
      history?.push("/doc/new");
    });

    // The context value is memoized, so v3's post-navigation re-render (with an
    // unchanged location) does not re-propagate and wipe the transient state.
    expect(await screen.findByText("leave-prompt")).toBeInTheDocument();
    expect(screen.getByText("leave-prompt")).toBeInTheDocument();
  });
});
