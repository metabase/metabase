import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

import MetabaseSettings from "metabase/lib/settings";
import ProfileLink from "metabase/nav/components/ProfileLink";

const REGULAR_ITEMS = [
  "Account settings",
  "Activity",
  "Help",
  "About Metabase",
  "Sign out",
];
const ADMIN_ITEMS = [...REGULAR_ITEMS, "Admin"];
const HOSTED_ITEMS = [...ADMIN_ITEMS, "Manage Metabase Cloud"];

describe("ProfileLink", () => {
  describe("options", () => {
    ["regular", "hosted"].forEach(testCase => {
      describe(`${testCase} instance`, () => {
        beforeEach(() => {
          jest.spyOn(MetabaseSettings, "isHosted");
          MetabaseSettings.isHosted = jest.fn(() => false);
        });

        afterEach(() => {
          MetabaseSettings.isHosted.mockRestore();
        });

        if (testCase === "hosted") {
          beforeEach(() => {
            MetabaseSettings.isHosted = jest.fn(() => true);
          });
        }

        describe("normal user", () => {
          it("should show the proper set of items", () => {
            const normalUser = { is_superuser: false };
            render(<ProfileLink user={normalUser} context={""} />);

            assertOn(REGULAR_ITEMS);
          });
        });

        describe("admin", () => {
          it("should show the proper set of items", () => {
            const admin = { is_superuser: true };
            render(<ProfileLink user={admin} context={""} />);

            testCase === "hosted"
              ? assertOn(HOSTED_ITEMS)
              : assertOn(ADMIN_ITEMS);
          });
        });
      });
    });
  });
});

function assertOn(items) {
  const SETTINGS = screen.getByRole("img", { name: /gear/i });
  fireEvent.click(SETTINGS);

  items.forEach(title => {
    screen.getByText(title);
  });

  expect(screen.getAllByRole("listitem").length).toEqual(items.length);
}
