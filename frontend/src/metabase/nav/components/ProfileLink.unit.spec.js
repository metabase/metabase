import { screen, fireEvent } from "@testing-library/react";

import { renderWithProviders } from "__support__/ui";
import { mockSettings } from "__support__/settings";

import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockAdminState,
  createMockAdminAppState,
} from "metabase-types/store/mocks";

import ProfileLink from "metabase/nav/components/ProfileLink";

const REGULAR_ITEMS = [
  "Account settings",
  "Help",
  "About Metabase",
  "Sign out",
];
const ADMIN_ITEMS = [...REGULAR_ITEMS, "Admin settings"];
const HOSTED_ITEMS = [...ADMIN_ITEMS];

const adminNavItem = {
  name: `People`,
  path: "/admin/people",
  key: "people",
};

function setup({ isAdmin = false, isHosted = false }) {
  const currentUser = createMockUser({ is_superuser: isAdmin });
  const settings = mockSettings({ "is-hosted?": isHosted });

  const admin = createMockAdminState({
    app: createMockAdminAppState({
      paths: isAdmin ? [adminNavItem] : [],
    }),
  });

  return renderWithProviders(<ProfileLink user={currentUser} context="" />, {
    storeInitialState: { admin, currentUser, settings },
  });
}

function setupHosted(opts = {}) {
  return setup({ ...opts, isHosted: true });
}

describe("ProfileLink", () => {
  describe("self-hosted", () => {
    it("should show the proper set of items for normal users", () => {
      setup({ isAdmin: false });

      fireEvent.click(screen.getByRole("img", { name: /gear/i }));

      REGULAR_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", () => {
      setup({ isAdmin: true });

      fireEvent.click(screen.getByRole("img", { name: /gear/i }));

      ADMIN_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("hosted", () => {
    it("should show the proper set of items for normal users", () => {
      setupHosted({ isAdmin: false });

      fireEvent.click(screen.getByRole("img", { name: /gear/i }));

      REGULAR_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", () => {
      setupHosted({ isAdmin: true });

      fireEvent.click(screen.getByRole("img", { name: /gear/i }));

      HOSTED_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });
});
