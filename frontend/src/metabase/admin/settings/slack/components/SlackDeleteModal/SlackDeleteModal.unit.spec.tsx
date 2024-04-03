import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SlackDeleteModal from "./SlackDeleteModal";

describe("SlackDeleteModal", () => {
  it("should delete the app and close the modal on submit", async () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();

    render(<SlackDeleteModal onDelete={onDelete} onClose={onClose} />);
    await userEvent.click(screen.getByText("Delete"));

    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("should close the modal on cancel", async () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();

    render(<SlackDeleteModal onDelete={onDelete} onClose={onClose} />);
    await userEvent.click(screen.getByText("Cancel"));

    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
