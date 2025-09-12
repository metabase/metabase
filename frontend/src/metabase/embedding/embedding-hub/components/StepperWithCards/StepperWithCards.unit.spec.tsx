import { render, screen } from "__support__/ui";

import type { StepperStep } from "./StepperWithCards";
import { StepperWithCards } from "./StepperWithCards";

const createMockSteps = (
  stepConfigs: {
    id: string;
    title: string;
    cards: { id: string; done?: boolean; optional?: boolean }[];
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
});
