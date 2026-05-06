import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import type { MetabotTodoItem } from "metabase-types/api";

import { AgentTodoListMessage } from "./MetabotAgentTodoMessage";

const createMockTodoItem = (
  overrides: Partial<MetabotTodoItem> = {},
): MetabotTodoItem => ({
  id: "1",
  content: "Test todo item",
  status: "pending",
  priority: "medium",
  ...overrides,
});

const setup = (todos: MetabotTodoItem[]) => {
  return renderWithProviders(<AgentTodoListMessage todos={todos} />);
};

describe("AgentTodoListMessage", () => {
  it("should render all todo item status correctly", async () => {
    setup([
      createMockTodoItem({
        id: "1",
        content: "Pending task",
        status: "pending",
      }),
      createMockTodoItem({
        id: "2",
        content: "In progress task",
        status: "in_progress",
      }),
      createMockTodoItem({
        id: "3",
        content: "Completed task",
        status: "completed",
      }),
      createMockTodoItem({
        id: "4",
        content: "Cancelled task",
        status: "cancelled",
      }),
    ]);

    // Check that all todo items are rendered
    expect(await screen.findByText("Pending task")).toBeInTheDocument();
    expect(await screen.findByText("In progress task")).toBeInTheDocument();
    expect(await screen.findByText("Completed task")).toBeInTheDocument();
    expect(await screen.findByText("Cancelled task")).toBeInTheDocument();

    // Check status indicators
    expect(
      await screen.findByRole("img", { name: /check icon/ }),
    ).toBeInTheDocument(); // completed
    expect(
      await screen.findByRole("img", { name: /arrow_right icon/ }),
    ).toBeInTheDocument(); // in_progress
    expect(
      await screen.findByRole("img", { name: /close icon/ }),
    ).toBeInTheDocument(); // cancelled

    // Check that completed and cancelled items have strikethrough
    const completedTask = await screen.findByText("Completed task");
    const cancelledTask = await screen.findByText("Cancelled task");
    expect(completedTask).toHaveStyle("text-decoration: line-through");
    expect(cancelledTask).toHaveStyle("text-decoration: line-through");

    // Check that pending and in_progress items don't have strikethrough
    const pendingTask = await screen.findByText("Pending task");
    const inProgressTask = await screen.findByText("In progress task");
    expect(pendingTask).not.toHaveStyle("text-decoration: line-through");
    expect(inProgressTask).not.toHaveStyle("text-decoration: line-through");
  });

  it("should be collapsible", async () => {
    setup([
      createMockTodoItem({ id: "1", content: "Test task", status: "pending" }),
    ]);

    // Initially opened (default state)
    expect(await screen.findByText("Test task")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", { name: /chevrondown icon/ }),
    ).toBeInTheDocument();

    // Click header to collapse
    await userEvent.click(await screen.findByTestId("todo-list-header"));

    // Should be collapsed
    expect(
      await screen.findByRole("img", { name: /chevronup icon/ }),
    ).toBeInTheDocument();

    // Click header again to expand
    await userEvent.click(await screen.findByTestId("todo-list-header"));

    // Should be expanded again
    expect(
      await screen.findByRole("img", { name: /chevrondown icon/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Test task")).toBeInTheDocument();
  });
});
