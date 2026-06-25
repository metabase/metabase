import type { ReactNode } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";

import { getMonitorRoutes } from "./routes";

// Mock the enterprise premium-feature gate so setupEnterpriseOnlyPlugin can flip
// PLUGIN_MONITOR on. The diagnostics initializer reads `hasPremiumFeature("dependencies")`.
jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn().mockReturnValue(true),
}));

// Keep this a focused routing test: stub the space/section layouts to pass
// children through, so we don't have to wire up their user-key-value/settings
// endpoints. The routing under test (upsell vs. diagnostics) is what we assert.
jest.mock("./MonitorLayout", () => ({
  MonitorLayout: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
jest.mock(
  "metabase/monitor/dependency-diagnostics/DependencyDiagnosticsSectionLayout",
  () => ({
    DependencyDiagnosticsSectionLayout: ({
      children,
    }: {
      children?: ReactNode;
    }) => <div data-testid="diagnostics-section">{children}</div>,
  }),
);

// Stub the heavy EE diagnostics pages so the enabled branch renders without
// their data-fetching plumbing. The real route function (broken/unreferenced)
// still gets invoked through PLUGIN_MONITOR.
jest.mock("metabase-enterprise/monitor/dependency-diagnostics/pages", () => ({
  BrokenDependencyDiagnosticsPage: () => <div>{"Broken page"}</div>,
  UnreferencedDependencyDiagnosticsPage: () => <div>{"Unreferenced page"}</div>,
}));

const CanAccessMonitor = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);

const UPSELL_TITLE =
  "Find and fix broken dependencies without hunting them down";

const setup = (initialRoute: string) => {
  renderWithProviders(getMonitorRoutes(CanAccessMonitor), {
    withRouter: true,
    initialRoute,
  });
};

describe("getMonitorRoutes", () => {
  afterEach(() => {
    // Restore PLUGIN_MONITOR to its OSS defaults between cases.
    reinitialize();
  });

  describe("OSS (PLUGIN_MONITOR disabled)", () => {
    it("renders the upsell at /monitor/dependency-diagnostics", async () => {
      setup("/monitor/dependency-diagnostics");

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
      expect(
        screen.queryByTestId("diagnostics-section"),
      ).not.toBeInTheDocument();
    });

    it("renders the upsell for redirected child paths (e.g. /broken)", async () => {
      setup("/monitor/dependency-diagnostics/broken");

      // The IndexRoute + path="*" fallback means old /broken bookmarks land on
      // the upsell, not NotFound.
      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
      expect(screen.queryByText("Broken page")).not.toBeInTheDocument();
    });
  });

  describe("EE (PLUGIN_MONITOR enabled)", () => {
    it("renders the diagnostics section and child routes instead of the upsell", async () => {
      setupEnterpriseOnlyPlugin("monitor_dependency_diagnostics");

      setup("/monitor/dependency-diagnostics/broken");

      expect(
        await screen.findByTestId("diagnostics-section"),
      ).toBeInTheDocument();
      expect(screen.getByText("Broken page")).toBeInTheDocument();
      expect(screen.queryByText(UPSELL_TITLE)).not.toBeInTheDocument();
    });

    it("redirects the diagnostics index to the broken route", async () => {
      setupEnterpriseOnlyPlugin("monitor_dependency_diagnostics");

      setup("/monitor/dependency-diagnostics");

      expect(await screen.findByText("Broken page")).toBeInTheDocument();
    });
  });
});
