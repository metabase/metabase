import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "metabase/ui";

import { MultiStepPopover } from "./MultiStepPopover";

const setup = (currentStep = "step1") => {
  return render(
    <MultiStepPopover currentStep={currentStep}>
      <MultiStepPopover.Target>
        <Button>Hello world</Button>
      </MultiStepPopover.Target>
      <MultiStepPopover.Step value="step1">
        Step 1 content
      </MultiStepPopover.Step>
      <MultiStepPopover.Step value="step2">
        Step 2 content
      </MultiStepPopover.Step>
      <MultiStepPopover.Step value="step3">
        Step 3 content
      </MultiStepPopover.Step>
    </MultiStepPopover>,
  );
};

describe("MultiStepPopover", () => {
  it("should render the trigger button", () => {
    setup();
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("should show popover content when button is clicked", async () => {
    setup();
    const button = screen.getByText("Hello world");
    await userEvent.click(button);
    expect(screen.getByText("Step 1 content")).toBeInTheDocument();
  });

  it("should render correct step content based on currentStep prop", async () => {
    setup("step2");
    const button = screen.getByText("Hello world");
    await userEvent.click(button);
    expect(screen.getByText("Step 2 content")).toBeInTheDocument();
  });

  it("should render nothing in dropdown when invalid step is provided", async () => {
    setup("invalid-step");
    const button = screen.getByText("Hello world");
    await userEvent.click(button);
    expect(screen.queryByText("Step 1 content")).not.toBeInTheDocument();
    expect(screen.queryByText("Step 2 content")).not.toBeInTheDocument();
    expect(screen.queryByText("Step 3 content")).not.toBeInTheDocument();
  });

  describe("Step component", () => {
    it("should render children within a Paper component", () => {
      render(
        <MultiStepPopover.Step value="test">
          Test content
        </MultiStepPopover.Step>,
      );

      const content = screen.getByText("Test content");
      expect(content).toBeInTheDocument();
    });
  });
});
