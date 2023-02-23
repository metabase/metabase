import { render, screen } from "@testing-library/react";
import React, { ReactNode, useRef } from "react";
import Popover from "./Popover";

interface TestChildComponentProps {
  maxHeight?: number;
}

function TestChildComponent({ maxHeight }: TestChildComponentProps) {
  return (
    <>
      <div>child component</div>
      {maxHeight && <div>has max height</div>}
    </>
  );
}

interface TestComponentProps {
  children: ReactNode;
  isOpen: boolean;
}

function TestComponent({ children, isOpen }: TestComponentProps) {
  const targetRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={targetRef}>
      <Popover target={targetRef.current} isOpen={isOpen}>
        {children}
      </Popover>
    </div>
  );
}

interface SetupProps {
  popoverContent?: ReactNode;
  isOpen?: boolean;
}

function setup({
  popoverContent = <TestChildComponent />,
  isOpen = true,
}: SetupProps) {
  render(<TestComponent isOpen={isOpen}>{popoverContent}</TestComponent>);
}

describe("Popover", () => {
  it("should render its children when 'isOpen' is true", () => {
    setup({});
    expect(screen.getByText("child component")).toBeInTheDocument();
  });

  it("should not render its children when 'isOpen' is false", () => {
    setup({ isOpen: false });
    expect(screen.queryByText("child component")).not.toBeInTheDocument();
  });

  it("should provide a 'maxHeight' prop to a single child", () => {
    setup({});
    expect(screen.getByText("has max height")).toBeInTheDocument();
  });

  it("should provide a 'maxHeight' prop to multiple children", () => {
    setup({
      popoverContent: [
        <TestChildComponent key={0} />,
        <TestChildComponent key={1} />,
      ],
    });
    expect(screen.getAllByText("has max height").length).toEqual(2);
  });

  it("should provide a 'maxHeight' prop to a function child", () => {
    const popoverContent = ({ maxHeight }: { maxHeight: number }) => (
      <>
        <TestChildComponent maxHeight={maxHeight} />
        <TestChildComponent />
      </>
    );
    setup({
      popoverContent,
    });
    expect(screen.getAllByText("has max height").length).toEqual(1);
  });
});
