import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupDashboardEndpoints,
  setupUpdateDashboardEndpointWithError,
} from "__support__/server-mocks";
import {
  setupPerformanceEndpoints,
  setupPerformanceEndpointsError,
} from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { selectCacheStrategy } from "metabase/admin/performance/components/test-utils";
import { UndoListing } from "metabase/common/components/UndoListing";
import { reinitialize } from "metabase/plugins";
import { checkNotNull } from "metabase/utils/types";
import type { Dashboard } from "metabase-types/api";
import {
  createMockDashboard,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DashboardInfo } from "./DashboardInfo";

type SetupOpts = {
  dashboard?: Dashboard;
  hasCacheConfigError?: boolean;
  hasUpdateError?: boolean;
  hasGranularCaching?: boolean;
  isRemoteSyncReadOnly?: boolean;
};

function setup({
  dashboard = createMockDashboard({ id: 10, can_set_cache_policy: true }),
  hasCacheConfigError = false,
  hasUpdateError = false,
  hasGranularCaching = true,
  isRemoteSyncReadOnly = false,
}: SetupOpts = {}) {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({
      cache_granular_controls: hasGranularCaching,
      remote_sync: isRemoteSyncReadOnly,
    }),
    "remote-sync-enabled": isRemoteSyncReadOnly,
    "remote-sync-type": isRemoteSyncReadOnly ? "read-only" : undefined,
  });
  // A plugin enabled by an earlier test stays enabled until it is reset
  reinitialize();
  setupEnterpriseOnlyPlugin("caching");
  setupEnterpriseOnlyPlugin("remote_sync");
  if (hasCacheConfigError) {
    setupPerformanceEndpointsError();
  } else {
    setupPerformanceEndpoints([]);
  }
  if (hasUpdateError) {
    setupUpdateDashboardEndpointWithError(dashboard.id);
  } else {
    setupDashboardEndpoints(dashboard);
  }

  const { router } = renderWithProviders(
    <>
      <DashboardInfo dashboard={dashboard} />
      <UndoListing />
    </>,
    {
      storeInitialState: createMockState({ settings }),
      withRouter: true,
      initialRoute: "/data-studio/dashboards/10",
    },
  );

  return { router: checkNotNull(router) };
}

function getUpdateCalls() {
  return fetchMock.callHistory.calls("path:/api/dashboard/10", {
    method: "PUT",
  });
}

function getLastUpdateBody(): unknown {
  return getUpdateCalls().at(-1)?.options.body;
}

async function startEditingDescription(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByTestId("editable-text"));
  return screen.getByTestId("dashboard-description-input");
}

describe("DashboardInfo", () => {
  it("shows who last edited the dashboard", async () => {
    setup();

    expect(await screen.findByText("Caching policy")).toBeInTheDocument();
    expect(screen.getByText("Last edited by John Doe")).toBeInTheDocument();
  });

  it("omits the last edit for a dashboard without revisions", async () => {
    setup({
      // The API leaves it out for a dashboard without revisions
      dashboard: createMockDashboard({
        id: 10,
        can_set_cache_policy: true,
        "last-edit-info": undefined,
      }),
    });

    expect(await screen.findByText("Caching policy")).toBeInTheDocument();
    expect(screen.queryByText(/Last edited by/)).not.toBeInTheDocument();
  });

  it("shows the default caching policy when the dashboard has none of its own", async () => {
    setup();

    expect(await screen.findByText("Caching policy")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("says when the caching policy cannot be loaded", async () => {
    setup({ hasCacheConfigError: true });

    expect(await screen.findByText("Failed to load")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  describe("caching policy", () => {
    it("opens the caching form and shows the saved policy", async () => {
      setup();

      await userEvent.click(
        await screen.findByRole("button", { name: "Caching policy" }),
      );
      const form = await screen.findByTestId("sidesheet");
      expect(within(form).getByText("Caching settings")).toBeInTheDocument();
      expect(
        within(form).queryByRole("button", { name: /Caching settings/ }),
      ).not.toBeInTheDocument();

      await selectCacheStrategy(/Don.t cache/i);
      await userEvent.click(
        within(form).getByTestId("strategy-form-submit-button"),
      );

      expect(
        await screen.findByRole("button", { name: "Caching policy" }),
      ).toHaveTextContent("No caching");
    });

    it("lets the page navigate after the form saves", async () => {
      const { router } = setup();

      await userEvent.click(
        await screen.findByRole("button", { name: "Caching policy" }),
      );
      const form = await screen.findByTestId("sidesheet");
      await selectCacheStrategy(/Don.t cache/i);
      await userEvent.click(
        within(form).getByTestId("strategy-form-submit-button"),
      );
      await waitFor(() =>
        expect(screen.queryByTestId("sidesheet")).not.toBeInTheDocument(),
      );

      act(() => router.navigate("/dashboard/10#edit"));

      expect(router.location.pathname).toBe("/dashboard/10");
    });

    it("is read-only for a dashboard in the trash", async () => {
      setup({
        dashboard: createMockDashboard({
          id: 10,
          can_set_cache_policy: true,
          archived: true,
        }),
      });

      expect(await screen.findByText("Default")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Caching policy" }),
      ).not.toBeInTheDocument();
    });

    it.each([
      {
        name: "the user cannot set the cache policy",
        opts: {
          dashboard: createMockDashboard({
            id: 10,
            can_set_cache_policy: false,
          }),
        },
      },
      {
        name: "granular caching is off",
        opts: { hasGranularCaching: false },
      },
    ])("is hidden when $name", async ({ opts }) => {
      setup(opts);

      expect(await screen.findByText("Auto-apply filters")).toBeInTheDocument();
      expect(screen.queryByText("Caching policy")).not.toBeInTheDocument();
    });
  });

  describe("description", () => {
    it("saves the new description", async () => {
      setup({
        dashboard: createMockDashboard({ id: 10, description: "Old" }),
      });

      const input = await startEditingDescription();
      await userEvent.clear(input);
      await userEvent.type(input, "New");
      await userEvent.tab();

      await waitFor(() =>
        expect(getLastUpdateBody()).toBe(
          JSON.stringify({ description: "New" }),
        ),
      );
    });

    it("clears the description when it is emptied", async () => {
      setup({
        dashboard: createMockDashboard({ id: 10, description: "Old" }),
      });

      await userEvent.clear(await startEditingDescription());
      await userEvent.tab();

      await waitFor(() =>
        expect(getLastUpdateBody()).toBe(JSON.stringify({ description: null })),
      );
    });

    it("trims the description", async () => {
      setup({
        dashboard: createMockDashboard({ id: 10, description: "Old" }),
      });

      const input = await startEditingDescription();
      await userEvent.clear(input);
      await userEvent.type(input, "  New  ");
      await userEvent.tab();

      await waitFor(() =>
        expect(getLastUpdateBody()).toBe(
          JSON.stringify({ description: "New" }),
        ),
      );
    });

    it("shows an error and keeps the unsaved description when the description cannot be saved", async () => {
      setup({
        dashboard: createMockDashboard({ id: 10, description: "Old" }),
        hasUpdateError: true,
      });

      await userEvent.type(await startEditingDescription(), " text");
      await userEvent.tab();

      const toast = await screen.findByRole("status");
      expect(
        within(toast).getByText("Failed to update dashboard description"),
      ).toBeInTheDocument();
      expect(await screen.findByText("Old text")).toBeInTheDocument();
      expect(getUpdateCalls()).toHaveLength(1);
    });

    it.each([
      {
        name: "the user cannot write the dashboard",
        opts: {
          dashboard: createMockDashboard({
            id: 10,
            description: "Revenue",
            can_write: false,
          }),
        },
      },
      {
        name: "the dashboard is in the trash",
        opts: {
          dashboard: createMockDashboard({
            id: 10,
            description: "Revenue",
            archived: true,
          }),
        },
      },
      {
        name: "remote sync is read-only",
        opts: {
          dashboard: createMockDashboard({ id: 10, description: "Revenue" }),
          isRemoteSyncReadOnly: true,
        },
      },
    ])("is read-only when $name", async ({ opts }) => {
      setup(opts);

      expect(await screen.findByText("Revenue")).toBeInTheDocument();
      expect(screen.queryByTestId("editable-text")).not.toBeInTheDocument();
    });

    it("says when a read-only dashboard has no description", async () => {
      setup({
        dashboard: createMockDashboard({
          id: 10,
          description: null,
          can_write: false,
        }),
      });

      expect(await screen.findByText("No description")).toBeInTheDocument();
      expect(screen.queryByTestId("editable-text")).not.toBeInTheDocument();
    });
  });

  describe("auto-apply filters", () => {
    it("saves the new value", async () => {
      setup();

      await userEvent.click(
        await screen.findByRole("switch", { name: "Auto-apply filters" }),
      );

      await waitFor(() =>
        expect(getLastUpdateBody()).toBe(
          JSON.stringify({ auto_apply_filters: false }),
        ),
      );
      expect(
        fetchMock.callHistory.calls("path:/api/dashboard/10", {
          method: "PUT",
        }),
      ).toHaveLength(1);
    });

    it("shows an error when the change cannot be saved", async () => {
      setup({ hasUpdateError: true });

      await userEvent.click(
        await screen.findByRole("switch", { name: "Auto-apply filters" }),
      );

      const toast = await screen.findByRole("status");
      expect(
        within(toast).getByText("Failed to update auto-apply filters"),
      ).toBeInTheDocument();
    });

    it.each([
      {
        name: "the user cannot write the dashboard",
        opts: { dashboard: createMockDashboard({ id: 10, can_write: false }) },
      },
      {
        name: "the dashboard is in the trash",
        opts: { dashboard: createMockDashboard({ id: 10, archived: true }) },
      },
      {
        name: "remote sync is read-only",
        opts: { isRemoteSyncReadOnly: true },
      },
    ])("is read-only when $name", async ({ opts }) => {
      setup(opts);

      expect(await screen.findByText("Auto-apply filters")).toBeInTheDocument();
      expect(screen.getByText("On")).toBeInTheDocument();
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });
  });
});
