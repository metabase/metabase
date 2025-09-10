import { fireEvent, render, screen } from "__support__/ui";
import { PLUGIN_IS_PASSWORD_USER } from "metabase/plugins";
import { createMockUser } from "metabase-types/api/mocks";

import { AccountHeader } from "./AccountHeader";

const getUser = () =>
  createMockUser({
    id: 1,
    first_name: "John",
    last_name: "Doe",
    email: "john@metabase.test",
    sso_source: "google",
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

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Password")).toBeInTheDocument();
    expect(screen.getByText("Login History")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
  });

  it("should show the password tab if it is enabled by a plugin", () => {
    const user = getUser();
    PLUGIN_IS_PASSWORD_USER.push((user) => user.sso_source === "google");

    render(<AccountHeader user={user} />);

    expect(screen.getByText("Password")).toBeInTheDocument();
  });

  it("should hide the password tab if it is disabled by a plugin", () => {
    const user = getUser();
    PLUGIN_IS_PASSWORD_USER.push((user) => user.sso_source !== "google");

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

  describe("Avatar functionality", () => {
    it("should show edit avatar button", () => {
      const user = getUser();

      render(<AccountHeader user={user} />);

      expect(screen.getByTestId("edit-avatar-button")).toBeInTheDocument();
    });

    it("should open avatar modal when edit button is clicked", () => {
      const user = getUser();

      render(<AccountHeader user={user} />);

      fireEvent.click(screen.getByTestId("edit-avatar-button"));

      expect(screen.getByText("Edit Avatar")).toBeInTheDocument();
      expect(screen.getByText("Upload Avatar")).toBeInTheDocument();
    });

    it("should show avatar image when user has avatar_url", () => {
      const user = getUser();
      user.avatar_url = "data:image/jpeg;base64,test-image-data";

      render(<AccountHeader user={user} />);

      const avatarImage = screen.getByAltText("John Doe avatar");
      expect(avatarImage).toBeInTheDocument();
      expect(avatarImage).toHaveAttribute(
        "src",
        "data:image/jpeg;base64,test-image-data",
      );
    });

    it("should show initials when user has no avatar_url", () => {
      const user = getUser();
      user.avatar_url = null;

      render(<AccountHeader user={user} />);

      expect(screen.getByText("JD")).toBeInTheDocument();
    });
  });
});
