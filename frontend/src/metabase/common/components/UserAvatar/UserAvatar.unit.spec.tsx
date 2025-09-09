import { render, screen } from "__support__/ui";

import UserAvatar from "./UserAvatar";

describe("UserAvatar", () => {
  describe("Users", () => {
    test("render user with name", async () => {
      const revisionUser = {
        first_name: "Testy",
        last_name: "Tableton",
        common_name: "Testy Tableton",
        email: "user@metabase.test",
      };

      render(<UserAvatar user={revisionUser} />);

      expect(await screen.findByText("TT")).toBeInTheDocument();
    });

    test("render user without name", async () => {
      const revisionUser = {
        first_name: null,
        last_name: null,
        common_name: "user@metabase.test",
        email: "user@metabase.test",
      };

      render(<UserAvatar user={revisionUser} />);

      expect(await screen.findByText("US")).toBeInTheDocument();
    });
  });

  describe("Revision history", () => {
    test("render user with name", async () => {
      const revisionUser = {
        first_name: "Testy",
        last_name: "Tableton",
        common_name: "Testy Tableton",
      };

      render(<UserAvatar user={revisionUser} />);

      expect(await screen.findByText("TT")).toBeInTheDocument();
    });

    test("render user without name", async () => {
      const revisionUser = {
        first_name: null,
        last_name: null,
        common_name: "user@metabase.test",
      };

      render(<UserAvatar user={revisionUser} />);

      expect(await screen.findByText("US")).toBeInTheDocument();
    });
  });

  describe("Admin > Groups", () => {
    test("render group name", async () => {
      const revisionUser = {
        first_name: "Admin",
      };

      render(<UserAvatar user={revisionUser} />);

      expect(await screen.findByText("A")).toBeInTheDocument();
    });
  });

  describe("Avatar Images", () => {
    test("render avatar image when avatar_url is provided", async () => {
      const userWithAvatar = {
        first_name: "Testy",
        last_name: "Tableton",
        common_name: "Testy Tableton",
        email: "user@metabase.test",
        avatar_url: "data:image/jpeg;base64,test-image-data",
      };

      render(<UserAvatar user={userWithAvatar} />);

      const avatarImage = await screen.findByAltText("Testy Tableton avatar");
      expect(avatarImage).toBeInTheDocument();
      expect(avatarImage).toHaveAttribute(
        "src",
        "data:image/jpeg;base64,test-image-data",
      );
    });

    test("fallback to initials when avatar_url is null", async () => {
      const userWithoutAvatar = {
        first_name: "Testy",
        last_name: "Tableton",
        common_name: "Testy Tableton",
        email: "user@metabase.test",
        avatar_url: null,
      };

      render(<UserAvatar user={userWithoutAvatar} />);

      expect(await screen.findByText("TT")).toBeInTheDocument();
      expect(
        screen.queryByAltText("Testy Tableton avatar"),
      ).not.toBeInTheDocument();
    });

    test("fallback to initials when avatar_url is undefined", async () => {
      const userWithoutAvatar = {
        first_name: "Testy",
        last_name: "Tableton",
        common_name: "Testy Tableton",
        email: "user@metabase.test",
      };

      render(<UserAvatar user={userWithoutAvatar} />);

      expect(await screen.findByText("TT")).toBeInTheDocument();
      expect(
        screen.queryByAltText("Testy Tableton avatar"),
      ).not.toBeInTheDocument();
    });
  });
});
