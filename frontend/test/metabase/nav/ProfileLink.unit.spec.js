import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import MetabaseSettings from "metabase/lib/settings";
import ProfileLink from "metabase/nav/components/ProfileLink";

const OPTIONS = [
  "Account settings",
  "Activity",
  "Help",
  "About Metabase",
  "Sign out",
];
const ADMIN_OPTIONS = [...OPTIONS, "Admin"];

describe("ProfileLink", () => {
  describe("options", () => {
    beforeEach(() => {
      jest.spyOn(MetabaseSettings, "isHosted");
      MetabaseSettings.isHosted = jest.fn(() => false);
    });

    afterEach(() => {
      MetabaseSettings.isHosted.mockRestore();
    });
    describe("normal user", () => {
      it("should show the proper set of items", () => {
        const normalUser = { is_superuser: false };
        render(<ProfileLink user={normalUser} context={""} />);

        const SETTINGS = screen.getByRole("img", { name: /gear/i });
        fireEvent.click(SETTINGS);

        OPTIONS.forEach(title => {
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

        ADMIN_OPTIONS.forEach(title => {
          screen.getByText(title);
        });
      });
    });
  });
});
