import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { QuestionModeSwitcher } from "./QuestionModeSwitcher";

function setup({ value }: { value: "ask" | "research" }) {
  return renderWithProviders(
    <Route
      path="/question/:mode"
      component={() => <QuestionModeSwitcher value={value} />}
    />,
    {
      withRouter: true,
      initialRoute: `/question/${value}`,
    },
  );
}

describe("QuestionModeSwitcher", () => {
  it("renders both segments with the matching one selected", () => {
    setup({ value: "ask" });

    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Research")).toBeInTheDocument();

    const askRadio = screen.getByRole("radio", { name: "Explore" });
    const researchRadio = screen.getByRole("radio", { name: "Research" });
    expect(askRadio).toBeChecked();
    expect(researchRadio).not.toBeChecked();
  });

  it("navigates to /question/research when the Research segment is clicked on the ask page", async () => {
    const { history } = setup({ value: "ask" });

    await userEvent.click(screen.getByText("Research"));

    await waitFor(() => {
      expect(history?.getCurrentLocation().pathname).toBe("/question/research");
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

    await userEvent.click(screen.getByText("Explore"));

    expect(history?.getCurrentLocation().pathname).toBe(before);
  });
});
