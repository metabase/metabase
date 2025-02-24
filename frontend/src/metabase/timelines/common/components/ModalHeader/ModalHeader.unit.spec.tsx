import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import ModalHeader from "./ModalHeader";

const defaultProps = {
  showPath: false,
  collectionName: "Foo",
};

describe("ModalHeader", () => {
  it("should render title", () => {
    render(<ModalHeader title="Events" {...defaultProps} />);

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.queryByText("Foo")).not.toBeInTheDocument();
  });

  it("should render title with path", () => {
    render(<ModalHeader title="Events" showPath={true} collectionName="Foo" />);

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText(/^in.*Foo$/)).toBeInTheDocument();
  });

  it("should render with actions", () => {
    render(
      <ModalHeader title="Events" {...defaultProps}>
        Actions
      </ModalHeader>,
    );

    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("should render with close button", async () => {
    const onClose = jest.fn();

    render(<ModalHeader title="Events" onClose={onClose} {...defaultProps} />);

    const closeButton = screen.getByLabelText("close icon");
    expect(closeButton).toBeInTheDocument();

    await userEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
