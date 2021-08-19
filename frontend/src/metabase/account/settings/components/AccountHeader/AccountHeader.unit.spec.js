import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AccountHeader from "./AccountHeader";
import { PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS } from "metabase/plugins";

const getUser = () => ({
  id: 1,
  first_name: "John",
  last_name: "Doe",
  email: "john@metabase.test",
  google_auth: true,
});

describe("AccountHeader", () => {
  const ORIGINAL_SHOW_CHANGE_PASSWORD_CONDITIONS = [
    ...PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS,
  ];

  beforeEach(() => {
    PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.splice(0);
  });

  afterEach(() => {
    PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.splice(
      0,
      PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.length,
      ...ORIGINAL_SHOW_CHANGE_PASSWORD_CONDITIONS,
    );
  });

  it("should show all tabs for a regular user", () => {
    const user = getUser();

    render(<AccountHeader user={user} />);

    screen.getByText("Profile");
    screen.getByText("Password");
    screen.getByText("Login History");
  });

  it("should show the password tab if it is enabled by a plugin", () => {
    const user = getUser();
    PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.push(user => user.google_auth);

    render(<AccountHeader user={user} />);

    screen.getByText("Password");
  });

  it("should hide the password tab if it is disabled by a plugin", () => {
    const user = getUser();
    PLUGIN_SHOW_CHANGE_PASSWORD_CONDITIONS.push(user => !user.google_auth);

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
