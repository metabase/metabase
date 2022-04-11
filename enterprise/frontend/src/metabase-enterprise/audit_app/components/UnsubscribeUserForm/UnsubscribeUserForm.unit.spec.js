import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import UnsubscribeUserForm from "./UnsubscribeUserForm";

const getUser = () => ({
  id: 1,
  common_name: "John Doe",
});

describe("UnsubscribeUserForm", () => {
  it("should close on successful submit", () => {
    const user = getUser();
    const onUnsubscribe = jest.fn().mockResolvedValue();
    const onClose = jest.fn();

    render(
      <UnsubscribeUserForm
        user={user}
        onUnsubscribe={onUnsubscribe}
        onClose={onClose}
      />,
    );

    screen.getByText("Unsubscribe").click();

    waitFor(() => {
      expect(onUnsubscribe).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("should display a message on submit failure", () => {
    const user = getUser();
    const error = { data: { message: "error" } };
    const onUnsubscribe = jest.fn().mockRejectedValue();
    const onClose = jest.fn();

    render(
      <UnsubscribeUserForm
        user={user}
        onUnsubscribe={onUnsubscribe}
        onClose={onClose}
      />,
    );

    screen.getByText("Unsubscribe").click();

    waitFor(() => {
      expect(onUnsubscribe).toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText(error.data.message)).toBeInTheDocument();
    });
  });
});
