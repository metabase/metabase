import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { useUserMetabotPermissions } from "metabase/metabot/hooks";

import { QuestionModeSwitcher } from "./QuestionModeSwitcher";

// The switcher gates its render on `canUseNlq`. The hook hits
// settings + a permissions endpoint; mock it so individual tests
// can toggle the permission instead of arranging the full backend
// state.
jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useUserMetabotPermissions: jest.fn(),
}));

function setup({
  value,
  canUseNlq = true,
}: {
  value: "ask" | "research";
  canUseNlq?: boolean;
}) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    canUseNlq,
  } as any);

  // `react-router` v3 (used by Metabase) only mounts UI when the
  // current pathname matches a registered route. We register a
  // route covering both pathnames the switcher lives under
  // (`/question/ask` and `/explorations`) so the switcher renders
  // and the store's routing reducer is observable for the
  // navigation assertions below.
  const initialRoute = value === "ask" ? "/question/ask" : "/explorations";
  return renderWithProviders(
    <>
      <Route
        path="/question/:mode"
        component={() => <QuestionModeSwitcher value={value} />}
      />
      <Route
        path="/explorations"
        component={() => <QuestionModeSwitcher value={value} />}
      />
    </>,
    {
      withRouter: true,
      initialRoute,
    },
  );
}

describe("QuestionModeSwitcher", () => {
  it("renders both segments with the matching one selected", () => {
    setup({ value: "ask" });

    // Both labels visible in the segmented control.
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();

    // The matching radio is checked. SegmentedControl renders
    // hidden radios with role="radio".
    const askRadio = screen.getByRole("radio", { name: "Explore" });
    const researchRadio = screen.getByRole("radio", { name: "Research" });
    expect(askRadio).toBeChecked();
    expect(researchRadio).not.toBeChecked();
  });

  it("navigates to /explorations when the Research segment is clicked on the ask page", async () => {
    const { history } = setup({ value: "ask" });

    await userEvent.click(screen.getByText("Research"));

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/explorations");
    });
  });

  it("navigates to /question/ask when the Explore segment is clicked on the research page", async () => {
    const { history } = setup({ value: "research" });

    await userEvent.click(screen.getByText("Explore"));

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/question/ask");
    });
  });

  it("does not dispatch a navigation when the currently-active segment is clicked", async () => {
    const { history } = setup({ value: "ask" });
    const before = history?.getCurrentLocation().pathname;

    // Clicking the already-active segment is a no-op in Mantine's
    // `SegmentedControl` (it only fires onChange when the value
    // actually changes), but assert the pathname explicitly.
    await userEvent.click(screen.getByText("Explore"));

    expect(history?.getCurrentLocation().pathname).toBe(before);
  });

  it("renders nothing when the current user lacks NLQ permission", () => {
    setup({ value: "ask", canUseNlq: false });

    expect(screen.queryByText("Explore")).not.toBeInTheDocument();
    expect(screen.queryByText("Research")).not.toBeInTheDocument();
  });
});
