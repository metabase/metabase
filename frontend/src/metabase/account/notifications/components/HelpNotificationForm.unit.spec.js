import React from "react";
import { render, screen } from "@testing-library/react";
import HelpNotificationForm from "./HelpNotificationForm";

describe("HelpNotificationForm", () => {
  const onClose = jest.fn();

  it("should render with admin email", () => {
    render(
      <HelpNotificationForm
        adminEmail={"admin@example.com"}
        onClose={onClose}
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveProperty("href", "mailto:admin@example.com");
  });

  it("should render without admin email", () => {
    render(<HelpNotificationForm onClose={onClose} />);

    screen.getByText("administrator", { exact: false });
  });

  it("should close on button click", () => {
    render(<HelpNotificationForm onClose={onClose} />);

    screen.getByText("Got it").click();
    expect(onClose).toHaveBeenCalled();
  });
});
