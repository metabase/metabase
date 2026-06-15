import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import { setupAuditInfoEndpoint } from "__support__/server-mocks/audit";
import { setupBookmarksEndpoints } from "__support__/server-mocks/bookmark";
import { setupListNotificationEndpoints } from "__support__/server-mocks/notification";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { CollectionType } from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockSettings,
  createMockTokenFeatures,
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
  history: (id: number) => `/metric/${id}/history`,
};

interface SetupOpts {
  canWrite?: boolean;
  isEditable?: boolean;
  isAdmin?: boolean;
  showDataStudioLink?: boolean;
  collectionType?: CollectionType | null;
  withModal?: boolean;
  auditAppEnabled?: boolean;
  hasUsageAnalyticsAccess?: boolean;
}

function setup({
  canWrite = true,
  isEditable = true,
  isAdmin = false,
  showDataStudioLink = false,
  collectionType = null,
  withModal = false,
  auditAppEnabled = false,
  hasUsageAnalyticsAccess = false,
}: SetupOpts = {}) {
  setupEnterpriseOnlyPlugin("library");

  const Lib = jest.requireMock("metabase-lib");
  Lib.queryDisplayInfo.mockReturnValue({ isEditable });

  const card = createMockCard({
    can_write: canWrite,
    collection: createMockCollection({ type: collectionType }),
    last_query_start: "2024-01-01T00:00:00Z",
    type: "metric",
  });

  const user = createMockUser({
    is_superuser: isAdmin,
  });

  const settingValues = createMockSettings({
    "token-features": createMockTokenFeatures({
      library: true,
      cache_granular_controls: true,
      audit_app: auditAppEnabled,
    }),
  });

  const state = createMockState({
    settings: mockSettings(settingValues),
    currentUser: user,
  });

  if (auditAppEnabled) {
    setupEnterprisePlugins();
  }

  setupBookmarksEndpoints([]);
  setupListNotificationEndpoints({ card_id: card.id }, []);
  setupAuditInfoEndpoint(hasUsageAnalyticsAccess ? {} : { auditInfo: {} });
  if (withModal) {
    setupPerformanceEndpoints([]);
  }

  const toolbar = (
    <MetricToolbar
      card={card}
      urls={mockUrls}
      showDataStudioLink={showDataStudioLink}
    />
  );

  renderWithProviders(
    withModal ? <Route path="/" component={() => toolbar} /> : toolbar,
    withModal
      ? { storeInitialState: state, withRouter: true, initialRoute: "/" }
      : { storeInitialState: state },
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

  beforeAll(() => {
    mockSettings({
      "token-features": createMockTokenFeatures({
        library: true,
        cache_granular_controls: true,
      }),
    });
    setupEnterprisePlugins();
  });

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
      // Bookmark/Move/Duplicate ─ Add-to-dash/Alert ─ Caching ─ Trash
      expect(getDividers()).toHaveLength(3);
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
      expect(getDividers()).toHaveLength(3);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should show 'Open in Data Studio' when in library collection", async () => {
      setup({
        showDataStudioLink: true,
        collectionType: "library-metrics",
        isAdmin: true,
      });
      await openMenu();

      expect(screen.getByText("Open in Data Studio")).toBeInTheDocument();
      // Bookmark/Move/Duplicate ─ Add-to-dash/Alert ─ Caching ─ DataStudio/Insights ─ Trash
      expect(getDividers()).toHaveLength(4);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide 'Open in Data Studio' when not in library collection", async () => {
      setup({ showDataStudioLink: true, collectionType: null, isAdmin: true });
      await openMenu();

      expect(screen.queryByText("Open in Data Studio")).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(3);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide 'Open in Data Studio' when showDataStudioLink=false", async () => {
      setup({
        showDataStudioLink: false,
        collectionType: "library-metrics",
        isAdmin: true,
      });
      await openMenu();

      expect(screen.queryByText("Open in Data Studio")).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(3);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide 'Open in Data Studio' when user is not an admin", async () => {
      setup({ showDataStudioLink: true, collectionType: "library-metrics" });
      await openMenu();

      expect(screen.queryByText("Open in Data Studio")).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(3);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should show 'Caching' as a menu item when the metric is cacheable", async () => {
      setup({ canWrite: true });
      await openMenu();

      expect(screen.getByText("Caching")).toBeInTheDocument();
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should hide 'Caching' when the user cannot write the metric", async () => {
      setup({ canWrite: false });
      await openMenu();

      expect(screen.queryByText("Caching")).not.toBeInTheDocument();
    });
  });

  describe("Caching menu interaction", () => {
    it("opens the Caching modal when the Caching menu item is clicked", async () => {
      setup({ withModal: true });
      await openMenu();
      await userEvent.click(screen.getByText("Caching"));

      expect(
        await screen.findByRole("dialog", { name: /Caching/i }),
      ).toBeInTheDocument();
      expect(await screen.findByTestId("cache-strategy-select")).toHaveValue(
        "Default",
      );
    });
  });

  describe("Explore button", () => {
    it("should not render an Explore button in the toolbar", () => {
      setup({ canWrite: true });

      expect(screen.queryByTestId("explore-link")).not.toBeInTheDocument();
    });
  });

  describe("usage analytics", () => {
    it("should show 'Metric usage analytics' with a divider for users with usage analytics access", async () => {
      setup({ auditAppEnabled: true, hasUsageAnalyticsAccess: true });
      await openMenu();

      expect(
        await screen.findByText("Metric usage analytics"),
      ).toBeInTheDocument();
      // Bookmark/Move/Duplicate ─ Add-to-dash/Alert ─ Caching ─ Insights ─ Trash
      expect(getDividers()).toHaveLength(4);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should not render an extra divider for users without usage analytics access", async () => {
      setup({ auditAppEnabled: true, hasUsageAnalyticsAccess: false });
      await openMenu();

      expect(
        screen.queryByText("Metric usage analytics"),
      ).not.toBeInTheDocument();
      expect(getDividers()).toHaveLength(3);
      expectNoConsecutiveOrTrailingDividers();
    });

    it("should not render a trailing divider for read-only users without usage analytics access", async () => {
      setup({
        auditAppEnabled: true,
        hasUsageAnalyticsAccess: false,
        canWrite: false,
      });
      await openMenu();

      expect(getDividers()).toHaveLength(1);
      expectNoConsecutiveOrTrailingDividers();
    });
  });
});
