import React from "react";
import { render, screen } from "@testing-library/react";
import Settings from "metabase/lib/settings";
import HelpModal from "./HelpModal";

describe("HelpModal", () => {
  it("should render with admin email", () => {
    Settings.set("admin-email", "admin@example.com");

    render(<HelpModal adminEmail={"admin@example.com"} />);

    const link = screen.getByRole("link");
    expect(link).toHaveProperty("href", "mailto:admin@example.com");
  });

  it("should render without admin email", () => {
    Settings.set("admin-email", null);

    render(<HelpModal />);

    screen.getByText("administrator", { exact: false });
  });

  it("should close on button click", () => {
    const onClose = jest.fn();

    render(<HelpModal onClose={onClose} />);

    screen.getByText("Got it").click();
    expect(onClose).toHaveBeenCalled();
  });
});
