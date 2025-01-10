import { fireEvent, render, screen } from "@testing-library/react";

import { Banner } from "./Banner";

describe("Banner", () => {
  it("should render non-closable banner with content", () => {
    render(<Banner icon="warning" body="Foobar" />);

    expect(screen.getByTestId("app-banner")).toBeInTheDocument();
    expect(screen.getByLabelText("warning icon")).toBeInTheDocument();
    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
    expect(screen.getByText("Foobar")).toBeInTheDocument();
  });

  it("should render closable banner with content", () => {
    const closeMock = jest.fn();
    render(
      <Banner icon="warning" body="Foobar" closable onClose={closeMock} />,
    );

    expect(screen.getByTestId("app-banner")).toBeInTheDocument();
    expect(screen.getByLabelText("warning icon")).toBeInTheDocument();
    expect(screen.getByText("Foobar")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("close icon"));
    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
