import { fireEvent, render, screen } from "__support__/ui";

import {
  DashboardEmptyState,
  DashboardEmptyStateWithoutAddPrompt,
} from "./DashboardEmptyState";

type SetupOptions = {
  isDashboardEmpty: boolean;
  isEditing: boolean;
};

const setup = ({
  isDashboardEmpty = true,
  isEditing = false,
}: SetupOptions) => {
  const addQuestion = jest.fn();

  render(
    <DashboardEmptyState
      isNightMode={false}
      isDashboardEmpty={isDashboardEmpty}
      isEditing={isEditing}
      addQuestion={addQuestion}
    />,
  );

  return { addQuestion };
};

const illustration = () => screen.getByAltText("Empty dashboard illustration");
const assertBodyText = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => {
  expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  expect(screen.getByTestId("dashboard-empty-state-copy")).toHaveTextContent(
    description,
  );
};

describe("DashboardEmptyState", () => {
  it("renders dashboard empty state", () => {
    const { addQuestion } = setup({ isDashboardEmpty: true, isEditing: false });

    expect(illustration()).toBeInTheDocument();
    assertBodyText({
      title: "This dashboard is empty",
      description:
        "Click on the Edit button to add questions, filters, links, or text.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Add a chart" }));
    expect(addQuestion).toHaveBeenCalledTimes(1);
  });

  it("renders dashboard tab empty state", () => {
    const { addQuestion } = setup({
      isDashboardEmpty: false,
      isEditing: false,
    });

    expect(illustration()).toBeInTheDocument();
    assertBodyText({
      title: "There's nothing here, yet",
      description:
        "Click on the Edit button to add questions, filters, links, or text.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Add a chart" }));
    expect(addQuestion).toHaveBeenCalledTimes(1);
  });

  // Editing mode is always the same for both an empty dashboard and an empty dashboard tab
  it.each(["dashboard", "dashboard tab"])(
    "renders %s empty state in editing mode",
    context => {
      const { addQuestion } = setup({
        isDashboardEmpty: context === "dashboard",
        isEditing: true,
      });

      expect(illustration()).toBeInTheDocument();
      assertBodyText({
        title:
          "Create a new question or browse your collections for an existing one.",
        description:
          "Add link or text cards. You can arrange cards manually, or start with some default layouts by adding a section.",
      });

      fireEvent.click(screen.getByRole("button", { name: "Add a chart" }));
      expect(addQuestion).toHaveBeenCalledTimes(1);
    },
  );
});

describe("DashboardEmptyStateWithoutAddPrompt", () => {
  it("renders read-only empty state for the dashboard", () => {
    render(
      <DashboardEmptyStateWithoutAddPrompt
        isNightMode={false}
        isDashboardEmpty={true}
      />,
    );

    expect(illustration()).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "This dashboard is empty" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-empty-state-copy"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a chart" }),
    ).not.toBeInTheDocument();
  });

  it("renders read-only empty state for the dashboard tab", () => {
    render(
      <DashboardEmptyStateWithoutAddPrompt
        isNightMode={false}
        isDashboardEmpty={false}
      />,
    );

    expect(illustration()).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "There's nothing here, yet" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("dashboard-empty-state-copy"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a chart" }),
    ).not.toBeInTheDocument();
  });
});
