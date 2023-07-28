import { render, screen } from "@testing-library/react";
import ModalHeader from "./ModalHeader";

describe("ModalHeader", () => {
  it("should render title", () => {
    render(<ModalHeader title="Events" />);

    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("should render with actions", () => {
    render(<ModalHeader title="Events">Actions</ModalHeader>);

    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("should render with close button", () => {
    const onClose = jest.fn();

    render(<ModalHeader title="Events" onClose={onClose} />);

    expect(screen.getByLabelText("close icon")).toBeInTheDocument();
  });
});
