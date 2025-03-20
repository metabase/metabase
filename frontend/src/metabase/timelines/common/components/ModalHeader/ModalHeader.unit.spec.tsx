import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";

import ModalHeader from "./ModalHeader";

describe("ModalHeader", () => {
  it("should render title", () => {
    render(<ModalHeader title="Events" />);

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.queryByText("Foo")).not.toBeInTheDocument();
  });

  it("should render title with path", () => {
    const pathOptions = {
      showPath: true,
      collectionName: "Foo",
    };

    render(<ModalHeader title="Events" pathOptions={pathOptions} />);

    expect(screen.getByText("Events")).toBeInTheDocument();
    expect(screen.getByText(/^in.*Foo$/)).toBeInTheDocument();
  });

  it("should render with actions", () => {
    render(<ModalHeader title="Events">Actions</ModalHeader>);

    expect(screen.getByText("Actions")).toBeInTheDocument();
  });

  it("should render with close button", async () => {
    const onClose = jest.fn();

    render(<ModalHeader title="Events" onClose={onClose} />);

    const closeButton = screen.getByLabelText("close icon");
    expect(closeButton).toBeInTheDocument();

    await userEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
