import userEvent from "@testing-library/user-event";

import { render, screen, within } from "__support__/ui";

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
  it("should not automatically tick off former steps when completing a later step", async () => {
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

    // only the last step should be marked as done.
    expect(allSteps[0]).toHaveAttribute("data-done", "false");
    expect(allSteps[1]).toHaveAttribute("data-done", "false");
    expect(allSteps[2]).toHaveAttribute("data-done", "true");

    // stepper header + 3 cards are done
    expect(screen.getAllByLabelText("check icon")).toHaveLength(4);

    // each card header should have a check icon if done
    for (const id of [3, 5, 6]) {
      expect(
        await within(screen.getByTestId(`step-card-${id}`)).findByLabelText(
          "check icon",
        ),
      ).toBeInTheDocument();
    }
  });

  it("should consider optional cards as completed when determining step completion", async () => {
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

    // only the first step should be marked as done.
    expect(allSteps[0]).toHaveAttribute("data-done", "true");

    // step header + done card should have check icons
    expect(screen.getAllByLabelText("check icon")).toHaveLength(2);
    await within(screen.getByTestId(`step-card-1`)).findByLabelText(
      "check icon",
    );
  });

  it("should not mark step as done when it only has optional cards and none are done", () => {
    const steps = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: false, optional: true },
          { id: "2", done: false, optional: true },
        ],
      },
    ]);

    render(<StepperWithCards steps={steps} />);

    const allSteps = screen.getAllByRole("button");
    expect(allSteps).toHaveLength(1);

    // step should not be marked as done as no cards are actually done
    expect(allSteps[0]).toHaveAttribute("data-done", "false");

    // no check icons should be present
    expect(screen.queryByLabelText("check icon")).not.toBeInTheDocument();
  });

  it("marks step as done when it only has optional cards and at least one is done", async () => {
    const steps = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: true, optional: true },
          { id: "2", done: false, optional: true },
        ],
      },
    ]);

    render(<StepperWithCards steps={steps} />);

    const allSteps = screen.getAllByRole("button");
    expect(allSteps).toHaveLength(1);

    // step should be marked as done since at least one optional card is done
    expect(allSteps[0]).toHaveAttribute("data-done", "true");

    // step header and done card should have check icons
    expect(screen.getAllByLabelText("check icon")).toHaveLength(2);

    await within(screen.getByTestId(`step-card-1`)).findByLabelText(
      "check icon",
    );
  });

  it("should disable locked cards", async () => {
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

    // lock icon should be shown
    const lockIcon = screen.getByLabelText("lock icon");
    expect(lockIcon).toBeInTheDocument();

    // locked card should be disabled
    const lockedCard = screen.getByTestId("step-card-2");
    expect(lockedCard).toBeDisabled();

    // clicking the card should not trigger the action
    await userEvent.click(lockedCard);
    expect(mockClickAction).not.toHaveBeenCalled();

    // step should not be marked as done
    const allSteps = screen.getAllByRole("button");
    expect(allSteps).toHaveLength(2);
    expect(allSteps[0]).toHaveAttribute("data-done", "false");

    // no steps should be marked as done
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

  it("should mark next step with data-next-step", () => {
    const steps = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: true }, // done card
          { id: "2", done: false, locked: true }, // locked, should skip
          { id: "3", done: false, optional: true }, // optional, should skip
          { id: "4", done: false }, // this should be the next step
        ],
      },
      {
        id: "step2",
        title: "Second Step",
        cards: [
          { id: "5", done: false }, // should not be next since step 1 is incomplete
        ],
      },
    ]);

    render(<StepperWithCards steps={steps} />);

    expect(screen.getByTestId("step-card-4")).toHaveAttribute(
      "data-next-step",
      "true",
    );

    ["1", "2", "3", "5"].forEach((id) => {
      expect(screen.getByTestId(`step-card-${id}`)).not.toHaveAttribute(
        "data-next-step",
        "true",
      );
    });
  });

  it("should handle step progression and completion correctly", () => {
    const completeFirstStep = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [
          { id: "1", done: true },
          { id: "2", done: false, optional: true }, // optional, step is still complete
        ],
      },
      {
        id: "step2",
        title: "Second Step",
        cards: [
          { id: "3", done: false }, // this should be next
          { id: "4", done: false },
        ],
      },
    ]);

    render(<StepperWithCards steps={completeFirstStep} />);

    // Step 1 is complete, so card 3 should be next.
    expect(screen.getByTestId("step-card-3")).toHaveAttribute(
      "data-next-step",
      "true",
    );

    ["1", "2", "4"].forEach((id) => {
      expect(screen.getByTestId(`step-card-${id}`)).not.toHaveAttribute(
        "data-next-step",
        "true",
      );
    });
  });

  it("all steps complete", () => {
    // all steps are complete
    const allComplete = createMockSteps([
      {
        id: "step1",
        title: "First Step",
        cards: [{ id: "1", done: true }],
      },
      {
        id: "step2",
        title: "Second Step",
        cards: [
          { id: "2", done: true },
          { id: "3", done: false, optional: true }, // optional undone card
        ],
      },
    ]);

    render(<StepperWithCards steps={allComplete} />);

    // When all steps are complete, no cards should be marked as next
    const allCards = ["1", "2", "3"];
    allCards.forEach((id) => {
      const card = screen.getByTestId(`step-card-${id}`);
      expect(card).not.toHaveAttribute("data-next-step", "true");
    });
  });
});
