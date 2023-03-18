import React from "react";
import { render, screen } from "@testing-library/react";
import { mockSettings } from "__support__/settings";
import HelpModal from "./HelpModal";

describe("HelpModal", () => {
  it("should render with admin email", () => {
    mockSettings({ "admin-email": "admin@example.com" });

    render(<HelpModal adminEmail={"admin@example.com"} />);

    const link = screen.getByRole("link");
    expect(link).toHaveProperty("href", "mailto:admin@example.com");
  });

  it("should render without admin email", () => {
    mockSettings({ "admin-email": null });

    render(<HelpModal />);

    expect(
      screen.getByText("administrator", { exact: false }),
    ).toBeInTheDocument();
  });

  it("should close on button click", () => {
    const onClose = jest.fn();

    render(<HelpModal onClose={onClose} />);

    screen.getByText("Got it").click();
    expect(onClose).toHaveBeenCalled();
  });
});
