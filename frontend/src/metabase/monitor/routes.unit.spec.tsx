import type { ReactNode } from "react";
import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";

import { getMonitorRedirects, getMonitorRoutes } from "./routes";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn().mockReturnValue(true),
}));

// Keep this a focused routing test: stub the space/section layouts to pass
// children through, so we don't have to wire up their user-key-value/settings
// endpoints. The routing under test (redirects, upsell vs. diagnostics) is what
// we assert.
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

jest.mock("metabase-enterprise/monitor/dependency-diagnostics/pages", () => ({
  BrokenDependencyDiagnosticsPage: () => <div>{"Broken page"}</div>,
  UnreferencedDependencyDiagnosticsPage: () => <div>{"Unreferenced page"}</div>,
}));

const CanAccessMonitor = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);

const UPSELL_TITLE =
  "Find and fix broken dependencies without hunting them down";

// Render the real Monitor route tree together with the real legacy redirects, so
// an old `/data-studio/...` URL is resolved by the actual definitions — not a
// copy of them.
const setup = (initialRoute: string) => {
  renderWithProviders(
    <Route path="/">
      {getMonitorRedirects()}
      {getMonitorRoutes(CanAccessMonitor)}
    </Route>,
    { withRouter: true, initialRoute },
  );
};

describe("monitor routes", () => {
  afterEach(() => {
    reinitialize();
  });

  describe("getMonitorRoutes", () => {
    describe("OSS (Dependency Diagnostics disabled)", () => {
      it("renders the upsell at /monitor/dependency-diagnostics", async () => {
        setup("/monitor/dependency-diagnostics");

        expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
        expect(
          screen.queryByTestId("diagnostics-section"),
        ).not.toBeInTheDocument();
      });

      it("renders the upsell for child paths (e.g. /broken)", async () => {
        setup("/monitor/dependency-diagnostics/broken");

        expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
        expect(screen.queryByText("Broken page")).not.toBeInTheDocument();
      });
    });

    describe("EE (Dependency Diagnostics enabled)", () => {
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

  describe("getMonitorRedirects (legacy Data Studio URLs)", () => {
    it("redirects the old base URL into the Monitor area", async () => {
      setup("/data-studio/dependency-diagnostics");

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
    });

    it("redirects old child URLs (e.g. /broken) to the Monitor equivalent", async () => {
      setup("/data-studio/dependency-diagnostics/broken");

      expect(await screen.findByText(UPSELL_TITLE)).toBeInTheDocument();
    });
  });
});
