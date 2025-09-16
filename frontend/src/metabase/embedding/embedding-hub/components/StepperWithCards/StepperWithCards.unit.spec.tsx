import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import type { StepperCardClickAction, StepperStep } from "./StepperWithCards";
import { StepperWithCards } from "./StepperWithCards";

const createMockSteps = (
  stepConfigs: {
    id: string;
    title: string;
    cards: {
      id: string;
      done?: boolean;
      optional?: boolean;
      locked?: boolean;
      clickAction?: StepperCardClickAction;
    }[];
  }[],
): StepperStep[] => {
  return stepConfigs.map(({ id, title, cards }) => ({
    id,
    title,
    cards: cards.map((card) => ({
      ...card,
      title: "Title",
      description: "Description",
    })),
  }));
};

describe("StepperWithCards", () => {
  it("should not automatically tick off former steps when completing a later step", () => {
    const steps = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: false },
          { id: "2", done: false },
        ],
      },
      {
        id: "step2",
        title: "Second Step",
        cards: [
          { id: "3", done: true }, // both must be done to complete the step
          { id: "4", done: false },
        ],
      },
      {
        id: "step3",
        title: "Third Step",
        cards: [
          { id: "5", done: true },
          { id: "6", done: true },
        ],
      },
    ]);

    render(<StepperWithCards steps={steps} />);

    const allSteps = screen.getAllByRole("button");
    expect(allSteps).toHaveLength(3);

    // Only the last step should be marked as done.
    expect(allSteps[0]).toHaveAttribute("data-done", "false");
    expect(allSteps[1]).toHaveAttribute("data-done", "false");
    expect(allSteps[2]).toHaveAttribute("data-done", "true");

    // Only one check icon should be visible.
    const checkIcons = screen.getAllByLabelText("check icon");
    expect(checkIcons).toHaveLength(1);
  });

  it("should consider optional cards as completed when determining step completion", () => {
    const steps = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: true },
          { id: "2", done: false, optional: true },
        ],
      },
    ]);

    render(<StepperWithCards steps={steps} />);

    const allSteps = screen.getAllByRole("button");
    expect(allSteps).toHaveLength(1);

    // Only the first step should be marked as done.
    expect(allSteps[0]).toHaveAttribute("data-done", "true");

    const checkIcons = screen.getAllByLabelText("check icon");
    expect(checkIcons).toHaveLength(1);
  });

  it("should disable locked cards", () => {
    const mockClickAction = jest.fn();
    const steps = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: false },
          {
            id: "2",
            done: false,
            locked: true,
            clickAction: { type: "click", onClick: mockClickAction },
          },
        ],
      },
    ]);

    render(<StepperWithCards steps={steps} />);

    // Lock icon should be shown
    const lockIcon = screen.getByLabelText("lock icon");
    expect(lockIcon).toBeInTheDocument();

    // The locked card should be disabled
    const lockedCard = screen.getByTestId("step-card-2");
    expect(lockedCard).toBeDisabled();

    // Clicking the disabled card should not trigger the action
    userEvent.click(lockedCard);
    expect(mockClickAction).not.toHaveBeenCalled();

    // The step should not be marked as done
    const allSteps = screen.getAllByRole("button");
    expect(allSteps).toHaveLength(2);
    expect(allSteps[0]).toHaveAttribute("data-done", "false");

    // No steps should be marked as done
    const checkIcons = screen.queryAllByLabelText("check icon");
    expect(checkIcons).toHaveLength(0);
  });

  it("should not create links for locked cards with link actions", () => {
    const steps = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: false },
          {
            id: "2",
            done: false,
            locked: true,
            clickAction: {
              type: "link",
              to: "/test-link",
            },
          },
        ],
      },
    ]);

    render(<StepperWithCards steps={steps} />);

    // Should not find any links since the locked card shouldn't create one
    const links = screen.queryAllByRole("link");
    expect(links).toHaveLength(0);

    // Lock icon should still be present
    const lockIcon = screen.getByLabelText("lock icon");
    expect(lockIcon).toBeInTheDocument();
  });
});
