import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Sidesheet } from "./Sidesheet";

describe("Sidesheet", () => {
  it("should render when open", () => {
    render(
      <Sidesheet isOpen onClose={jest.fn()}>
        hello world
      </Sidesheet>,
    );

    expect(screen.getByTestId("sidesheet")).toBeInTheDocument();
  });

  it("should not render when not open", () => {
    render(
      <Sidesheet isOpen={false} onClose={jest.fn()}>
        hello world
      </Sidesheet>,
    );

    expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument();
  });

  it("should render with title", () => {
    render(
      <Sidesheet title="My Title" isOpen onClose={jest.fn()}>
        hello world
      </Sidesheet>,
    );

    expect(screen.getByText("My Title")).toBeInTheDocument();
  });

  it("should render with children", () => {
    render(
      <Sidesheet title="My Title" isOpen onClose={jest.fn()}>
        <div>some content</div>
        <div>more content</div>
      </Sidesheet>,
    );

    expect(screen.getByText("some content")).toBeInTheDocument();
    expect(screen.getByText("more content")).toBeInTheDocument();
  });

  it("should fire onClose when close button is clicked", async () => {
    const closeSpy = jest.fn();
    render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy}>
        hello world
      </Sidesheet>,
    );

    const closeButton = screen.getByLabelText("Close");
    await userEvent.click(closeButton);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("should fire onClose when modal backdrop is clicked", async () => {
    const closeSpy = jest.fn();

    render(
      <Sidesheet title="My Title" isOpen onClose={closeSpy}>
        hello world
      </Sidesheet>,
    );

    const backdrop = screen.getByTestId("modal-overlay");
    await userEvent.click(backdrop);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
