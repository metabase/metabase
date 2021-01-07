import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import ProfileLink from "metabase/nav/components/ProfileLink";

describe("ProfileLink", () => {
  describe("options", () => {
    describe("normal user", () => {
      it("should show the proper set of items", () => {
        const normalUser = { is_superuser: false };
        render(<ProfileLink user={normalUser} context={""} />);

        const SETTINGS = screen.getByRole("img", { name: /gear/i });
        fireEvent.click(SETTINGS);

        [
          "Account settings",
          "Activity",
          "Help",
          "About Metabase",
          "Sign out",
        ].forEach(title => {
          screen.getByText(title);
        });
      });
    });

    describe("admin", () => {
      it("should show the proper set of items", () => {
        const admin = { is_superuser: true };
        render(<ProfileLink user={admin} context={""} />);

        const SETTINGS = screen.getByRole("img", { name: /gear/i });
        fireEvent.click(SETTINGS);

        [
          "Account settings",
          "Admin",
          "Activity",
          "Help",
          "About Metabase",
          "Sign out",
        ].forEach(title => {
          screen.getByText(title);
        });
      });
    });
  });
});
