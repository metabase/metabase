import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SidesheetSubPage } from "./SidesheetSubPage";

describe("Sidesheet", () => {
  it("should always render with a back button", () => {
    render(
      <SidesheetSubPage
        isOpen
        title="Subpage title"
        onClose={jest.fn()}
        onBack={jest.fn()}
      >
        hello world
      </SidesheetSubPage>,
    );

    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
    expect(screen.getByLabelText("chevronleft icon")).toBeInTheDocument();
  });

  it("should not render when not open", () => {
    render(
      <SidesheetSubPage
        isOpen={false}
        title="Subpage title"
        onClose={jest.fn()}
        onBack={jest.fn()}
      >
        hello world
      </SidesheetSubPage>,
    );

    expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument();
  });

  it("should render with title", () => {
    render(
      <SidesheetSubPage
        isOpen
        title="Subpage title"
        onClose={jest.fn()}
        onBack={jest.fn()}
      >
        hello world
      </SidesheetSubPage>,
    );

    expect(screen.getByText("Subpage title")).toBeInTheDocument();
  });

  it("should render with children", () => {
    render(
      <SidesheetSubPage
        isOpen
        title="Subpage title"
        onClose={jest.fn()}
        onBack={jest.fn()}
      >
        <div>some content</div>
        <div>more content</div>
      </SidesheetSubPage>,
    );

    expect(screen.getByText("some content")).toBeInTheDocument();
    expect(screen.getByText("more content")).toBeInTheDocument();
  });

  it("should fire onClose when close button is clicked", async () => {
    const closeSpy = jest.fn();
    render(
      <SidesheetSubPage
        isOpen
        title="Subpage title"
        onClose={closeSpy}
        onBack={jest.fn()}
      >
        hello world
      </SidesheetSubPage>,
    );

    const closeButton = screen.getByLabelText("Close");
    await userEvent.click(closeButton);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("should fire onClose when modal backdrop is clicked", async () => {
    const closeSpy = jest.fn();

    render(
      <SidesheetSubPage
        isOpen
        title="Subpage title"
        onClose={closeSpy}
        onBack={jest.fn()}
        withOverlay
      >
        hello world
      </SidesheetSubPage>,
    );

    const backdrop = screen.getByTestId("modal-overlay");
    await userEvent.click(backdrop);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("should fire onBack when back button is clicked", async () => {
    const backSpy = jest.fn();

    render(
      <SidesheetSubPage
        isOpen
        title="Subpage title"
        onClose={jest.fn()}
        onBack={backSpy}
      >
        hello world
      </SidesheetSubPage>,
    );

    const backBtn = screen.getByLabelText("chevronleft icon");
    await userEvent.click(backBtn);
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});
