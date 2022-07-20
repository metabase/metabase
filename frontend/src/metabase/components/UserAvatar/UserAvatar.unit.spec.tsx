import React from "react";
import { render } from "@testing-library/react";
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

      const { findByText } = render(<UserAvatar user={revisionUser} />);

      expect(await findByText("TT")).toBeInTheDocument();
    });

    test("render user without name", async () => {
      const revisionUser = {
        first_name: null,
        last_name: null,
        common_name: "user@metabase.test",
        email: "user@metabase.test",
      };

      const { findByText } = render(<UserAvatar user={revisionUser} />);

      expect(await findByText("US")).toBeInTheDocument();
    });
  });

  describe("Revision history", () => {
    test("render user with name", async () => {
      const revisionUser = {
        first_name: "Testy",
        last_name: "Tableton",
        common_name: "Testy Tableton",
      };

      const { findByText } = render(<UserAvatar user={revisionUser} />);

      expect(await findByText("TT")).toBeInTheDocument();
    });

    test("render user without name", async () => {
      const revisionUser = {
        first_name: null,
        last_name: null,
        common_name: "user@metabase.test",
      };

      const { findByText } = render(<UserAvatar user={revisionUser} />);

      expect(await findByText("US")).toBeInTheDocument();
    });
  });

  describe("Admin > Groups", () => {
    test("render group name", async () => {
      const revisionUser = {
        first_name: "Admin",
      };

      const { findByText } = render(<UserAvatar user={revisionUser} />);

      expect(await findByText("A")).toBeInTheDocument();
    });
  });
});
