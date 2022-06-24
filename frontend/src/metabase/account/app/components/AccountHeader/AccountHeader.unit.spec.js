import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AccountHeader from "./AccountHeader";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";

const getUser = () => ({
  id: 1,
  first_name: "John",
  last_name: "Doe",
  email: "john@metabase.test",
  google_auth: true,
});

describe("AccountHeader", () => {
  const ORIGINAL_PLUGIN_IS_PASSWORD_USER = [...PLUGIN_IS_PASSWORD_USER];

  beforeEach(() => {
    PLUGIN_IS_PASSWORD_USER.splice(0);
  });

  afterEach(() => {
    PLUGIN_IS_PASSWORD_USER.splice(
      0,
      PLUGIN_IS_PASSWORD_USER.length,
      ...ORIGINAL_PLUGIN_IS_PASSWORD_USER,
    );
  });

  it("should show all tabs for a regular user", () => {
    const user = getUser();

    render(<AccountHeader user={user} />);

    screen.getByText("Profile");
    screen.getByText("Password");
    screen.getByText("Login History");
    screen.getByText("Notifications");
  });

  it("should show the password tab if it is enabled by a plugin", () => {
    const user = getUser();
    PLUGIN_IS_PASSWORD_USER.push(user => user.google_auth);

    render(<AccountHeader user={user} />);

    screen.getByText("Password");
  });

  it("should hide the password tab if it is disabled by a plugin", () => {
    const user = getUser();
    PLUGIN_IS_PASSWORD_USER.push(user => !user.google_auth);

    render(<AccountHeader user={user} />);

    expect(screen.queryByText("Password")).not.toBeInTheDocument();
  });

  it("should change location when a tab is selected", () => {
    const user = getUser();
    const onChangeLocation = jest.fn();

    render(<AccountHeader user={user} onChangeLocation={onChangeLocation} />);

    fireEvent.click(screen.getByText("Profile"));
    expect(onChangeLocation).toHaveBeenCalledWith("/account/profile");
  });
});
