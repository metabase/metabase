import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_DATA_STUDIO, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { QuestionDependenciesSection } from "./QuestionDependenciesSection";

// Mock the DependencyGraphModal to avoid API requests
jest.mock("../DependencyGraphModal", () => ({
  DependencyGraphModal: function MockDependencyGraphModal({
    opened,
    onClose,
  }: {
    entry: { id: number; type: string };
    opened: boolean;
    onClose: () => void;
  }) {
    if (!opened) {
      return null;
    }
    return (
      <div data-testid="dependency-graph-modal">
        <h2>Dependency graph</h2>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

function createMockQuestion(card = createMockCard()): Question {
  return {
    id: () => card.id,
    card: () => card,
    type: () => card.type,
    _card: card,
  } as unknown as Question;
}

type SetupOpts = {
  question?: Question;
  dependenciesCount?: number;
  dependentsCount?: number;
  canAccessDataStudio?: boolean;
};

function setup({
  question = createMockQuestion(),
  dependenciesCount = 0,
  dependentsCount = 0,
  canAccessDataStudio = true,
}: SetupOpts = {}) {
  jest
    .spyOn(PLUGIN_DEPENDENCIES, "useGetDependenciesCount")
    .mockReturnValue({ dependenciesCount, dependentsCount });

  jest
    .spyOn(PLUGIN_DATA_STUDIO, "canAccessDataStudio")
    .mockReturnValue(canAccessDataStudio);

  renderWithProviders(
    <Route
      path="*"
      component={() => <QuestionDependenciesSection question={question} />}
    />,
    {
      withRouter: true,
      storeInitialState: createMockState(),
    },
  );
}

describe("QuestionDependenciesSection (Enterprise)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders nothing when user cannot access Data Studio", () => {
    setup({
      dependenciesCount: 5,
      dependentsCount: 3,
      canAccessDataStudio: false,
    });

    expect(screen.queryByText("Upstream")).not.toBeInTheDocument();
    expect(screen.queryByText("Downstream")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /View dependency graph/i }),
    ).not.toBeInTheDocument();
  });

  it("shows 'This question has no dependencies' when counts are 0", () => {
    setup({ dependenciesCount: 0, dependentsCount: 0 });

    expect(
      screen.getByText("This question has no dependencies."),
    ).toBeInTheDocument();
  });

  it("displays upstream count when there are dependencies", () => {
    setup({ dependenciesCount: 3, dependentsCount: 0 });

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Upstream")).toBeInTheDocument();
  });

  it("displays downstream count when there are dependents", () => {
    setup({ dependenciesCount: 0, dependentsCount: 5 });

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Downstream")).toBeInTheDocument();
  });

  it("displays both counts when there are dependencies and dependents", () => {
    setup({ dependenciesCount: 2, dependentsCount: 4 });

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Upstream")).toBeInTheDocument();
    expect(screen.getByText("Downstream")).toBeInTheDocument();
  });

  it("shows 'View dependency graph' button when there are dependencies", () => {
    setup({ dependenciesCount: 1, dependentsCount: 0 });

    expect(
      screen.getByRole("button", { name: /View dependency graph/i }),
    ).toBeInTheDocument();
  });

  it("opens modal when 'View dependency graph' button is clicked", async () => {
    setup({ dependenciesCount: 1, dependentsCount: 0 });

    const button = screen.getByRole("button", {
      name: /View dependency graph/i,
    });
    await userEvent.click(button);

    expect(await screen.findByText("Dependency graph")).toBeInTheDocument();
  });

  it("passes correct entry to useGetDependenciesCount hook", () => {
    const card = createMockCard({ id: 42 });
    const question = createMockQuestion(card);

    setup({ question, dependenciesCount: 1, dependentsCount: 0 });

    expect(PLUGIN_DEPENDENCIES.useGetDependenciesCount).toHaveBeenCalledWith({
      id: 42,
      type: "card",
    });
  });
});
