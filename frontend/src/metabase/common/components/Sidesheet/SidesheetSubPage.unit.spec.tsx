import userEvent from "@testing-library/user-event";

import { render, screen, waitFor } from "__support__/ui";

import { SidesheetSubPage } from "./SidesheetSubPage";

describe("Sidesheet", () => {
  it("should always render with a back button", async () => {
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

    expect(await screen.findByTestId("sidesheet")).toBeInTheDocument();
    expect(screen.getByLabelText("chevronleft icon")).toBeInTheDocument();
  });

  it("should not render when not open", async () => {
    render(
      <>
        <SidesheetSubPage
          isOpen={false}
          title="Closed subpage"
          onClose={jest.fn()}
          onBack={jest.fn()}
        >
          closed subpage
        </SidesheetSubPage>
        <SidesheetSubPage
          isOpen
          title="Open subpage"
          onClose={jest.fn()}
          onBack={jest.fn()}
        >
          open subpage
        </SidesheetSubPage>
      </>,
    );

    // An open sheet takes a few frames to appear, so wait for one before checking the closed one.
    expect(await screen.findByText("open subpage")).toBeInTheDocument();
    expect(screen.queryByText("closed subpage")).not.toBeInTheDocument();
  });

  it("should render with title", async () => {
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

    expect(await screen.findByText("Subpage title")).toBeInTheDocument();
  });

  it("should render with children", async () => {
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

    expect(await screen.findByText("some content")).toBeInTheDocument();
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

    const closeButton = await screen.findByLabelText("Close");
    await userEvent.click(closeButton);
    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
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

    const backdrop = await screen.findByTestId("modal-overlay");
    await userEvent.click(backdrop);
    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
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

    const backBtn = await screen.findByLabelText("chevronleft icon");
    await userEvent.click(backBtn);
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});
