import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupBugReportingDetailsEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { HelpLinkSetting } from "metabase-types/api";
import {
  createMockMetabaseInfo,
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockAdminAppState,
  createMockAdminState,
} from "metabase-types/store/mocks";

import { AppSwitcher } from "./AppSwitcher";

const USER = createMockUser();

const REGULAR_ITEMS = [
  USER.first_name as string,
  USER.email,
  "Help",
  "Sign out",
];
const ADMIN_ITEMS = [...REGULAR_ITEMS, "Main app", "Admin"];
const HOSTED_ITEMS = [...ADMIN_ITEMS];

const WITH_DATA_STUDIO = [...ADMIN_ITEMS, "Data studio"];

const adminNavItem = {
  name: `People`,
  path: "/admin/people",
  key: "people",
} as const;

async function setup({
  isAdmin = false,
  isHosted = false,
  isPaidPlan = true,
  hasDataStudio = false,
  helpLinkSetting = "metabase",
  helpLinkCustomDestinationSetting = "https://custom-destination.com/help",
  instanceCreationDate = dayjs().toISOString(),
}: {
  isAdmin?: boolean;
  isHosted?: boolean;
  isPaidPlan?: boolean;
  hasDataStudio?: boolean;
  helpLinkSetting?: HelpLinkSetting;
  helpLinkCustomDestinationSetting?: string;
  instanceCreationDate?: string;
} = {}) {
  setupBugReportingDetailsEndpoint();

  const settings = mockSettings({
    "is-hosted?": isHosted,
    "token-status": createMockTokenStatus({ valid: isPaidPlan }),
    "help-link": helpLinkSetting,
    "help-link-custom-destination": helpLinkCustomDestinationSetting,
    "instance-creation": instanceCreationDate,
    "token-features": createMockTokenFeatures({
      data_studio: hasDataStudio,
    }),
  });

  if (hasDataStudio) {
    setupEnterpriseOnlyPlugin("data-studio");
  }

  const admin = createMockAdminState({
    app: createMockAdminAppState({
      paths: isAdmin ? [adminNavItem] : [],
    }),
  });

  renderWithProviders(
    <>
      <Route path="/" component={AppSwitcher} />
      <Route path="/admin" app="admin" component={AppSwitcher} />
      <Route path="/data-studio" app="data-studio" component={AppSwitcher} />
    </>,
    {
      withRouter: true,
      storeInitialState: {
        admin,
        settings,
        currentUser: { ...USER, is_superuser: isAdmin },
      },
    },
  );

  await openProfileLink();
}

async function setupHosted(opts = {}) {
  return setup({ ...opts, isHosted: true });
}

describe("ProfileLink", () => {
  it("should render standard links", async () => {
    await setup();

    // Should always render a profile link
    expect(
      await screen.findByText(USER.first_name as string),
    ).toBeInTheDocument();
    expect(await screen.findByText(USER.email)).toBeInTheDocument();

    //Should render a help submenu
    expect(
      await screen.findByRole("menuitem", { name: "Help" }),
    ).toBeInTheDocument();

    // Should render logout
    expect(
      await screen.findByRole("menuitem", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  describe("self-hosted", () => {
    it("should show the proper set of items for normal users", async () => {
      await setup({ isAdmin: false });

      REGULAR_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", async () => {
      await setup({ isAdmin: true });

      ADMIN_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("current app", () => {
    it("should update it's apps section as you navigate", async () => {
      await setup({ isAdmin: true, hasDataStudio: true });

      await assertActiveApp("main");

      await userEvent.click(await getAdminMenuItem());
      await openProfileLink();
      await waitFor(() => assertActiveApp("admin"));

      await userEvent.click(await getDataStudioMenuItem());
      await openProfileLink();
      await assertActiveApp("data-studio");

      await userEvent.click(await getMainAppMenuItem());
      await openProfileLink();
      await assertActiveApp("main");
    });
  });

  describe("hosted", () => {
    it("should show the proper set of items for normal users", async () => {
      await setupHosted({ isAdmin: false });

      REGULAR_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
      expect(screen.queryByText("Admin settings")).not.toBeInTheDocument();
    });

    it("should show the proper set of items for admin users", async () => {
      await setupHosted({ isAdmin: true });

      HOSTED_ITEMS.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("with data studio", () => {
    it("should show data studio app when apropriate", async () => {
      await setup({ isAdmin: true, hasDataStudio: true });

      WITH_DATA_STUDIO.forEach((title) => {
        expect(screen.getByText(title)).toBeInTheDocument();
      });
    });
  });

  describe("help submenu", () => {
    describe("'How to use Metabase' link", () => {
      it("should render if the instance was created more than 30 days ago", async () => {
        await setup({
          instanceCreationDate: dayjs().subtract(42, "days").toISOString(),
        });
        await openHelpSubmenu();

        expect(screen.getByText("How to use Metabase")).toBeInTheDocument();
      });

      it("should not render for new instances (younger than 30 days)", async () => {
        await setup({
          instanceCreationDate: dayjs().subtract(14, "days").toISOString(),
        });
        await openHelpSubmenu();

        expect(
          screen.queryByText("How to use Metabase"),
        ).not.toBeInTheDocument();
      });
    });

    describe("help link", () => {
      describe("when the setting is set to hidden", () => {
        it("should return not be visible", async () => {
          await setup({
            helpLinkSetting: "hidden",
          });
          await openHelpSubmenu();

          const link = screen.queryByRole("menuitem", { name: /get help/i });

          expect(link).not.toBeInTheDocument();
        });
      });

      describe("when the setting is `custom`", () => {
        it("should return the custom destination", async () => {
          await setup({
            helpLinkSetting: "custom",
            helpLinkCustomDestinationSetting: "https://custom.example.org/help",
          });
          await openHelpSubmenu();

          const link = screen.getByRole("menuitem", { name: /get help/i });

          expect(link).toBeInTheDocument();
          expect(link).toHaveProperty(
            "href",
            "https://custom.example.org/help",
          );
        });
      });

      describe("when the setting is `metabase`", () => {
        describe("when admin on paid plan", () => {
          it("should return the default /help-premium link", async () => {
            await setup({
              isAdmin: true,
              isPaidPlan: true,
              helpLinkSetting: "metabase",
            });

            await openHelpSubmenu();

            const link = screen.getByRole("menuitem", { name: /get help/i });

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
            await setup({
              isAdmin: false,
              isPaidPlan: true,
              helpLinkSetting: "metabase",
            });

            await openHelpSubmenu();

            const link = screen.getByRole("menuitem", { name: /get help/i });

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
});

const openProfileLink = async () => {
  await userEvent.click(screen.getByRole("img", { name: /mode/i }));
  await screen.findByRole("menu");
};

const openHelpSubmenu = async () =>
  await userEvent.click(await screen.findByRole("menuitem", { name: "Help" }));

const assertActiveApp = async (current: "main" | "admin" | "data-studio") => {
  expect(
    await within(await getMainAppMenuItem()).findByRole("img", {
      name: current === "main" ? /check_filled/i : /dashboard/i,
    }),
  ).toBeInTheDocument();
  expect(
    await within(await getAdminMenuItem()).findByRole("img", {
      name: current === "admin" ? /check_filled/i : /io/i,
    }),
  ).toBeInTheDocument();
  expect(
    await within(await getDataStudioMenuItem()).findByRole("img", {
      name: current === "data-studio" ? /check_filled/i : /table/i,
    }),
  ).toBeInTheDocument();
};

const getMainAppMenuItem = () =>
  screen.findByRole("menuitem", { name: /main app/i });
const getAdminMenuItem = () =>
  screen.findByRole("menuitem", { name: /admin/i });
const getDataStudioMenuItem = () =>
  screen.findByRole("menuitem", { name: /data studio/i });
