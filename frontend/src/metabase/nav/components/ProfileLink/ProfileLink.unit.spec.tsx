import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";

import { setupBugReportingDetailsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { ProfileLink } from "metabase/nav/components/ProfileLink";
import type { HelpLinkSetting } from "metabase-types/api";
import {
  createMockMetabaseInfo,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockAdminAppState,
  createMockAdminState,
} from "metabase-types/store/mocks";

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
  instanceCreationDate = dayjs().toISOString(),
}: {
  isAdmin?: boolean;
  isHosted?: boolean;
  isPaidPlan?: boolean;
  helpLinkSetting?: HelpLinkSetting;
  helpLinkCustomDestinationSetting?: string;
  instanceCreationDate?: string;
}) {
  const settings = mockSettings({
    "is-hosted?": isHosted,
    "token-status": createMockTokenStatus({ valid: isPaidPlan }),
    "help-link": helpLinkSetting,
    "help-link-custom-destination": helpLinkCustomDestinationSetting,
    "instance-creation": instanceCreationDate,
  });

  const admin = createMockAdminState({
    app: createMockAdminAppState({
      paths: isAdmin ? [adminNavItem] : [],
    }),
  });

  return renderWithProviders(<ProfileLink />, {
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
    setupBugReportingDetailsEndpoint();
  });

  describe("self-hosted", () => {
    it("should show the proper set of items for normal users", async () => {
      setup({ isAdmin: false });

      await openMenu();

      REGULAR_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", async () => {
      setup({ isAdmin: true });

      await openMenu();

      ADMIN_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("hosted", () => {
    it("should show the proper set of items for normal users", async () => {
      setupHosted({ isAdmin: false });

      await openMenu();

      REGULAR_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", async () => {
      setupHosted({ isAdmin: true });

      await openMenu();

      HOSTED_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("'How to use Metabase' link", () => {
    it("should render if the instance was created more than 30 days ago", async () => {
      setup({
        instanceCreationDate: dayjs().subtract(42, "days").toISOString(),
      });

      await openMenu();
      expect(screen.getByText("How to use Metabase")).toBeInTheDocument();
    });

    it("should not render for new instances (younger than 30 days)", async () => {
      setup({
        instanceCreationDate: dayjs().subtract(14, "days").toISOString(),
      });

      await openMenu();
      expect(screen.queryByText("How to use Metabase")).not.toBeInTheDocument();
    });
  });

  describe("help link", () => {
    describe("when the setting is set to hidden", () => {
      it("should return not be visible", async () => {
        setup({
          helpLinkSetting: "hidden",
        });
        await openMenu();

        const link = screen.queryByRole("menuitem", { name: /help/i });

        expect(link).not.toBeInTheDocument();
      });
    });

    describe("when the setting is `custom`", () => {
      it("should return  the custom destination", async () => {
        setup({
          helpLinkSetting: "custom",
          helpLinkCustomDestinationSetting: "https://custom.example.org/help",
        });
        await openMenu();

        const link = screen.getByRole("menuitem", { name: /help/i });

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
          await openMenu();
          const link = screen.getByRole("menuitem", { name: /help/i });

          expect(link).toBeInTheDocument();
          const mockBugReportDetails = encodeURIComponent(
            JSON.stringify(createMockMetabaseInfo()),
          );
          const expected = `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=menu&utm_campaign=help&instance_version=v1&diag=${mockBugReportDetails}`;
          await waitFor(() => expect(link).toHaveProperty("href", expected));

          expect(link).toHaveProperty("href", expected);
        });
      });

      describe("when non admin", () => {
        it("should return the default /help link", async () => {
          setup({
            isAdmin: false,
            isPaidPlan: true,
            helpLinkSetting: "metabase",
          });
          await openMenu();
          const link = screen.getByRole("menuitem", { name: /help/i });

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

const openMenu = async () => {
  await userEvent.click(screen.getByRole("img", { name: /gear/i }));
  await screen.findByRole("menu");
};
