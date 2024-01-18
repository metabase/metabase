import { screen, waitFor } from "@testing-library/react";

import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "__support__/ui";
import { mockSettings } from "__support__/settings";

import {
  createMockAdminState,
  createMockAdminAppState,
} from "metabase-types/store/mocks";

import { ProfileLink } from "metabase/nav/components/ProfileLink";
import {
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import type { HelpLinkSetting } from "metabase-types/api";

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
} as const;

function setup({
  isAdmin = false,
  isHosted = false,
  isPaidPlan = true,
  helpLinkSetting = "metabase",
  helpLinkCustomDestinationSetting = "https://custom-destination.com/help",
}: {
  isAdmin?: boolean;
  isHosted?: boolean;
  isPaidPlan?: boolean;
  helpLinkSetting?: HelpLinkSetting;
  helpLinkCustomDestinationSetting?: string;
}) {
  const settings = mockSettings({
    "is-hosted?": isHosted,
    "token-status": createMockTokenStatus({ valid: isPaidPlan }),
    "help-link": helpLinkSetting,
    "help-link-custom-destination": helpLinkCustomDestinationSetting,
  });

  const admin = createMockAdminState({
    app: createMockAdminAppState({
      paths: isAdmin ? [adminNavItem] : [],
    }),
  });

  return renderWithProviders(<ProfileLink onLogout={jest.fn()} />, {
    storeInitialState: {
      admin,
      settings,
      currentUser: createMockUser({ is_superuser: isAdmin }),
    },
  });
}

function setupHosted(opts = {}) {
  return setup({ ...opts, isHosted: true });
}

describe("ProfileLink", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/util/bug_report_details", "mockBugReportDetails");
  });
  describe("self-hosted", () => {
    it("should show the proper set of items for normal users", () => {
      setup({ isAdmin: false });

      openMenu();

      REGULAR_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", () => {
      setup({ isAdmin: true });

      openMenu();

      ADMIN_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("hosted", () => {
    it("should show the proper set of items for normal users", () => {
      setupHosted({ isAdmin: false });

      openMenu();

      REGULAR_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", () => {
      setupHosted({ isAdmin: true });

      openMenu();

      HOSTED_ITEMS.forEach(title => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("help link", () => {
    describe("when the setting is set to hidden", () => {
      it("should return not be visible", () => {
        setup({
          helpLinkSetting: "hidden",
        });
        openMenu();

        const link = screen.queryByRole("link", { name: /help/i });

        expect(link).not.toBeInTheDocument();
      });
    });

    describe("when the setting is `custom`", () => {
      it("should return  the custom destination", () => {
        setup({
          helpLinkSetting: "custom",
          helpLinkCustomDestinationSetting: "https://custom.example.org/help",
        });
        openMenu();

        const link = screen.getByRole("link", { name: /help/i });

        expect(link).toBeInTheDocument();
        expect(link).toHaveProperty("href", "https://custom.example.org/help");
      });
    });

    describe("when the setting is `metabase`", () => {
      describe("when admin on paid plan", () => {
        it("should return the default /help-premium link", async () => {
          setup({
            isAdmin: true,
            isPaidPlan: true,
            helpLinkSetting: "metabase",
          });
          openMenu();
          const link = screen.getByRole("link", { name: /help/i });

          expect(link).toBeInTheDocument();
          const mockBugReportDetails = encodeURIComponent(
            JSON.stringify("mockBugReportDetails"),
          );
          const expected = `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1&diag=${mockBugReportDetails}`;
          await waitFor(() => expect(link).toHaveProperty("href", expected));

          expect(link).toHaveProperty("href", expected);
        });
      });

      describe("when non admin", () => {
        it("should return the default /help link", () => {
          setup({
            isAdmin: false,
            isPaidPlan: true,
            helpLinkSetting: "metabase",
          });
          openMenu();
          const link = screen.getByRole("link", { name: /help/i });

          expect(link).toBeInTheDocument();
          expect(link).toHaveProperty(
            "href",
            "https://www.metabase.com/help?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1",
          );
        });
      });
    });
  });
});

const openMenu = () =>
  userEvent.click(screen.getByRole("img", { name: /gear/i }));
