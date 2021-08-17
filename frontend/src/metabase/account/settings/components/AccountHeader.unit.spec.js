import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AccountHeader from "./AccountHeader";

const REGULAR_USER = {
  id: 1,
  first_name: "John",
  last_name: "Doe",
  email: "john@metabase.test",
};

const GOOGLE_USER = {
  id: 2,
  first_name: "John",
  last_name: "Doe",
  email: "john@metabase.test",
  google_auth: true,
};

describe("AccountHeader", () => {
  it("should show all tabs for a regular user", () => {
    render(<AccountHeader user={REGULAR_USER} />);

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.queryByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Login History")).toBeInTheDocument();
  });

  it("should hide the password tab if it is disabled by a plugin", () => {
    render(<AccountHeader user={GOOGLE_USER} />);

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.queryByText("Password")).not.toBeInTheDocument();
    expect(screen.getByText("Login History")).toBeInTheDocument();
  });

  it("should change location when a tab is selected", () => {
    const onChangeLocation = jest.fn();

    render(
      <AccountHeader user={REGULAR_USER} onChangeLocation={onChangeLocation} />,
    );

    fireEvent.click(screen.getByText("Profile"));
    expect(onChangeLocation).toHaveBeenCalledWith("/account/profile");
  });
});
