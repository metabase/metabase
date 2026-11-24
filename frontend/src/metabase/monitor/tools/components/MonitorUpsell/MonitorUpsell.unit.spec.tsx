import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { getMonitorRoutes } from "metabase/monitor/routes";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  createMockDataset,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

// Access policy is covered by route-guards.unit.spec.tsx; these specs are about
// which page the Erroring questions route renders.
jest.mock("metabase/monitor/route-guards", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  const allow = () => <Outlet />;
  return {
    CanAccessAiAuditing: allow,
    CanAccessAlertsManagement: allow,
    CanAccessApiKeyUsage: allow,
    CanAccessContentDiagnostics: allow,
    CanAccessDependencyDiagnostics: allow,
    CanAccessMonitor: allow,
    CanAccessMonitoringTools: allow,
    CanAccessSessionManagement: allow,
  };
});

jest.mock("metabase/monitor/components/MonitorLayout", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    ...jest.requireActual("metabase/monitor/components/MonitorLayout"),
    MonitorLayout: () => <Outlet />,
  };
});

const setup = ({ hasAuditApp }: { hasAuditApp: boolean }) => {
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ audit_app: hasAuditApp }),
  });
  setupEnterpriseOnlyPlugin("tools");
  fetchMock.post("path:/api/dataset", {
    ...createMockDataset(),
    total_count: 0,
  });
  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(<Route path="/">{getMonitorRoutes()}</Route>, {
    withRouter: true,
    initialRoute: Urls.monitorErroringQuestions(),
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings,
    }),
  });
};

describe("MonitorUpsell on the Erroring questions route", () => {
  afterEach(() => {
    reinitialize();
  });

  it("shows the upsell instead of the erroring questions without the audit_app feature", async () => {
    setup({ hasAuditApp: false });

    expect(
      await screen.findByRole("heading", { name: "Troubleshoot faster" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toBeVisible();
    expect(
      screen.queryByTestId("erroring-questions-table"),
    ).not.toBeInTheDocument();
  });

  it("shows the erroring questions with the audit_app feature", async () => {
    setup({ hasAuditApp: true });

    expect(
      await screen.findByTestId("erroring-questions-table"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Troubleshoot faster" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Upgrade to Pro" }),
    ).not.toBeInTheDocument();
  });
});
