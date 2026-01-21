import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { DependencyGraphModal } from "./DependencyGraphModal";

// Mock the DependencyGraph component since it has complex dependencies
jest.mock("../DependencyGraph", () => ({
  DependencyGraph: function MockDependencyGraph({
    entry,
  }: {
    entry: { id: number; type: string };
  }) {
    return (
      <div data-testid="dependency-graph">
        Mock DependencyGraph for {entry.type} {entry.id}
      </div>
    );
  },
}));

type SetupOpts = {
  entry?: { id: number; type: "card" | "transform" | "snippet" };
  opened?: boolean;
  onClose?: () => void;
};

function setup({
  entry = { id: 1, type: "card" },
  opened = true,
  onClose = jest.fn(),
}: SetupOpts = {}) {
  renderWithProviders(
    <Route
      path="*"
      component={() => (
        <DependencyGraphModal entry={entry} opened={opened} onClose={onClose} />
      )}
    />,
    { withRouter: true },
  );

  return { onClose };
}

describe("DependencyGraphModal", () => {
  it("renders modal with 'Dependency graph' title when opened", async () => {
    setup({ opened: true });

    expect(await screen.findByText("Dependency graph")).toBeInTheDocument();
  });

  it("does not render modal content when opened=false", () => {
    setup({ opened: false });

    expect(screen.queryByText("Dependency graph")).not.toBeInTheDocument();
  });

  it("contains DependencyGraph component", async () => {
    setup({ opened: true, entry: { id: 42, type: "card" } });

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(
      screen.getByText("Mock DependencyGraph for card 42"),
    ).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = jest.fn();
    setup({ opened: true, onClose });

    const closeButton = await screen.findByRole("button", { name: /close/i });
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalled();
  });
});
