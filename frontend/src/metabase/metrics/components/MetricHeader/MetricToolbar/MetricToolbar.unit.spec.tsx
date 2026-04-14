import userEvent from "@testing-library/user-event";

import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { CollectionType, User } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { MetricToolbar } from "./MetricToolbar";

jest.mock("metabase-lib", () => ({
  ...jest.requireActual("metabase-lib"),
  fromJsQueryAndMetadata: jest.fn().mockReturnValue("mock-query"),
  queryDisplayInfo: jest.fn().mockReturnValue({ isEditable: true }),
}));

jest.mock("metabase/metrics/utils/validation", () => ({
  isNumericMetric: jest.fn().mockReturnValue(false),
}));

const mockUrls = {
  about: (id: number) => `/metric/${id}`,
  overview: (id: number) => `/metric/${id}/overview`,
  query: (id: number) => `/metric/${id}/query`,
  dependencies: (id: number) => `/metric/${id}/dependencies`,
  caching: (id: number) => `/metric/${id}/caching`,
  history: (id: number) => `/metric/${id}/history`,
};

interface SetupOpts {
  canWrite?: boolean;
  isEditable?: boolean;
  isAdmin?: boolean;
  showDataStudioLink?: boolean;
  collectionType?: CollectionType | null;
}

function setup({
  canWrite = true,
  isEditable = true,
  isAdmin = false,
  showDataStudioLink = false,
  collectionType = null,
}: SetupOpts = {}) {
  const Lib = jest.requireMock("metabase-lib");
  Lib.queryDisplayInfo.mockReturnValue({ isEditable });

  const card = createMockCard({
    can_write: canWrite,
    collection: createMockCollection({ type: collectionType }),
    type: "metric",
  });

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  const settingValues = createMockSettings();

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: user as User,
  });

  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: card.id }, []);

  renderWithProviders(
    <MetricToolbar
      card={card}
      urls={mockUrls}
      showDataStudioLink={showDataStudioLink}
    />,
    { storeInitialState: state },
  );

  return { card };
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /More options/ }));
}

function getDividers() {
  return within(screen.getByRole("menu")).getAllByRole("separator");
}

function expectNoConsecutiveOrTrailingDividers() {
  const menu = screen.getByRole("menu");
  const dividers = within(menu).getAllByRole("separator");
  for (const divider of dividers) {
    // eslint-disable-next-line testing-library/no-node-access -- checking adjacency
    expect(divider.nextElementSibling).not.toHaveAttribute("role", "separator");
  }
  // eslint-disable-next-line testing-library/no-node-access -- checking last child
  expect(menu.lastElementChild).not.toHaveAttribute("role", "separator");
}

describe("MetricToolbar", () => {
  // Note: In OSS, canManageSubscriptions always returns true via the
  // PLUGIN_APPLICATION_PERMISSIONS default, so the alert item is always visible.

  describe("menu items", () => {
    it("should show bookmark, move, duplicate, add-to-dashboard, alert, and trash for writable metric", async () => {
      setup({ canWrite: true });
      await openMenu();

      expect(screen.getByText("Bookmark")).toBeInTheDocument();
      expect(screen.getByText("Move")).toBeInTheDocument();
      expect(screen.getByText("Duplicate")).toBeInTheDocument();
      expect(screen.getByText("Add to a dashboard")).toBeInTheDocument();
      expect(screen.getByText("Create an alert")).toBeInTheDocument();
      expect(screen.getByText("Move to trash")).toBeInTheDocument();
      expect(getDividers()).toHaveLength(2);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide move and trash when can_write=false", async () => {
      setup({ canWrite: false });
      await openMenu();

      expect(screen.getByText("Bookmark")).toBeInTheDocument();
      expect(screen.queryByText("Move")).not.toBeInTheDocument();
      expect(screen.getByText("Duplicate")).toBeInTheDocument();
      expect(screen.getByText("Add to a dashboard")).toBeInTheDocument();
      expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(1);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide duplicate when isEditable=false", async () => {
      setup({ isEditable: false });
      await openMenu();

      expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(2);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should show 'Open in Data Studio' when in library collection", async () => {
      setup({
        showDataStudioLink: true,
        collectionType: "library-metrics",
      });
      await openMenu();

      expect(screen.getByText("Open in Data Studio")).toBeInTheDocument();
      expect(getDividers()).toHaveLength(3);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide 'Open in Data Studio' when not in library collection", async () => {
      setup({ showDataStudioLink: true, collectionType: null });
      await openMenu();

      expect(screen.queryByText("Open in Data Studio")).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(2);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide 'Open in Data Studio' when showDataStudioLink=false", async () => {
      setup({
        showDataStudioLink: false,
        collectionType: "library-metrics",
      });
      await openMenu();

      expect(screen.queryByText("Open in Data Studio")).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(2);
      expectNoConsecutiveOrTrailingDividers();
    });
  });
});
