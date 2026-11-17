import userEvent from "@testing-library/user-event";
import fetchMock, { type CallLog } from "fetch-mock";
import _ from "underscore";

import {
  setupAdhocQueryEndpoint,
  setupBookmarksEndpoints,
  setupBugReportingDetailsEndpoint,
  setupCardEndpoints,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDatabasesEndpoints,
  setupDocumentErrorEndpoint,
  setupListLogsEndpoint,
  setupPropertiesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
  setupSettingEndpoint,
  setupTimelinesEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { DocumentPageOuter } from "metabase/documents/routes";
import { Route } from "metabase/router";
import * as iframeUtils from "metabase/utils/iframe";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Log, User } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockSettings,
  createMockUser,
  createMockVersionInfo,
} from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { App } from "./AppComponent";

interface SetupOpts {
  initialRoute: string;
  user?: User;
}

const setup = ({ initialRoute, user = createMockUser() }: SetupOpts) => {
  setupPropertiesEndpoints(createMockSettings());
  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: createMockVersionInfo(),
  });
  setupDatabasesEndpoints([]);
  setupSearchEndpoints([]);
  setupUserMetabotPermissionsEndpoint();
  setupBookmarksEndpoints([]);
  setupCollectionsEndpoints({ collections: [] });
  setupTimelinesEndpoints([]);

  renderWithProviders(
    <Route element={<App />}>
      <Route path="/document/:entityId" element={<DocumentPageOuter />} />
      <Route path="*" element={<div>Page content</div>} />
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({ currentUser: user }),
    },
  );
};

describe("App", () => {
  it("shows the not found page when a page reports a 404", async () => {
    setupDocumentErrorEndpoint(9999, { status: 404 });
    setup({ initialRoute: "/document/9999" });

    expect(
      await screen.findByText("We're a little lost..."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The page you asked for couldn't be found."),
    ).toBeInTheDocument();
  });

  describe("error diagnostics modal", () => {
    const ADMIN = createMockUser({ id: 7, is_superuser: true });
    const NORMAL_USER = createMockUser({ id: 8, is_superuser: false });

    const LOGS: Log[] = [
      createLog({ level: "INFO", msg: "Unrelated info" }),
      createLog({ level: "ERROR", msg: "Query failed {:metabase-user-id 9}" }),
      createLog({ level: "WARN", msg: "Slow query {:metabase-user-id 7}" }),
    ];

    const FRONTEND_ERRORS = [["Frontend error A"], ["Frontend error B", 42]];

    const BUG_REPORT_DETAILS = { "hosting-env": "diagnostics-test-env" };

    let downloads: { fileName: string; href: string }[] = [];
    let originalErrorBuffer: unknown[][];

    beforeEach(() => {
      downloads = [];
      jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(function (this: HTMLAnchorElement) {
          downloads.push({ fileName: this.download, href: this.href });
        });
      originalErrorBuffer = console.errorBuffer;
      console.errorBuffer = FRONTEND_ERRORS;
      setupListLogsEndpoint(LOGS);
      setupBugReportingDetailsEndpoint(BUG_REPORT_DETAILS);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      console.errorBuffer = originalErrorBuffer;
      act(() => window.history.pushState({}, "", "/"));
    });

    const visit = (path: string, user: User) => {
      // the modal reads the entity from the browser URL, not the router
      window.history.pushState({}, "", path);
      setup({ initialRoute: path, user });
    };

    const openWithKeyboard = async () => {
      await userEvent.keyboard("{Control>}{F1}{/Control}");
      return screen.findByRole("dialog", {
        name: "Gather diagnostic information",
      });
    };

    const downloadReport = async (modal: HTMLElement): Promise<unknown> => {
      const downloadCount = downloads.length;
      await userEvent.click(
        within(modal).getByRole("button", { name: "Download" }),
      );
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", {
            name: "Gather diagnostic information",
          }),
        ).not.toBeInTheDocument();
      });
      expect(downloads).toHaveLength(downloadCount + 1);
      const { fileName, href } = downloads[downloads.length - 1];
      expect(fileName).toMatch(/^metabase-diagnostic-info-.+\.json$/);
      const prefix = "data:text/json;charset=utf-8,";
      expect(href.startsWith(prefix)).toBe(true);
      const report: unknown = JSON.parse(
        decodeURIComponent(href.slice(prefix.length)),
      );
      return report;
    };

    const EXPECTED_ADMIN_DIAGNOSTICS = {
      frontendErrors: ['"Frontend error A"', '"Frontend error B"42'],
      logs: LOGS,
      backendErrors: [LOGS[1]],
      userLogs: [LOGS[2]],
      bugReportDetails: expect.objectContaining(BUG_REPORT_DETAILS),
    };

    it("opens with Ctrl + F1 on the home page and downloads the report", async () => {
      visit("/", ADMIN);
      const modal = await openWithKeyboard();

      const report = await downloadReport(modal);

      expect(report).toEqual(
        expect.objectContaining(EXPECTED_ADMIN_DIAGNOSTICS),
      );
      expect(report).not.toHaveProperty("entityName");
    });

    it("opens from the command palette", async () => {
      setupRecentViewsEndpoints([]);
      visit("/", ADMIN);
      await userEvent.keyboard("{Control>}k{/Control}");
      await userEvent.type(
        await screen.findByPlaceholderText(/search for anything/i),
        "Error",
      );
      await userEvent.click(await screen.findByText("Download diagnostics"));

      expect(
        await screen.findByRole("dialog", {
          name: "Gather diagnostic information",
        }),
      ).toBeVisible();
    });

    it("does not open in full app embedding", async () => {
      jest.spyOn(iframeUtils, "isWithinIframe").mockReturnValue(true);
      visit("/", ADMIN);
      await screen.findByText("Page content");

      await userEvent.keyboard("{Control>}{F1}{/Control}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(fetchMock.callHistory.called("list-logs")).toBe(false);
    });

    describe("on a question page", () => {
      const ORDERS_QUERY = Lib.toJsQuery(
        Lib.createTestQuery(SAMPLE_PROVIDER, {
          stages: [{ source: { type: "table", id: ORDERS_ID } }],
        }),
      );
      const QUESTION = createMockCard({
        id: 2,
        name: "Diagnostic Question 1",
        dataset_query: ORDERS_QUERY,
      });
      const QUERY_RESULTS = createMockDatasetData({ rows: [[1], [2]] });

      beforeEach(() => {
        setupCardEndpoints(QUESTION);
        setupAdhocQueryEndpoint((call: CallLog) =>
          createMockDataset({
            data: _.isEqual(getRequestBody(call), ORDERS_QUERY)
              ? QUERY_RESULTS
              : createMockDatasetData({ rows: [] }),
          }),
        );
      });

      it("includes the question and leaves out query results by default", async () => {
        visit("/question/2-diagnostic-question-1", ADMIN);
        const modal = await openWithKeyboard();
        expect(
          await screen.findByRole("checkbox", { name: "Query results" }),
        ).not.toBeChecked();

        const report = await downloadReport(modal);

        expect(report).toEqual(
          expect.objectContaining({
            ...EXPECTED_ADMIN_DIAGNOSTICS,
            entityName: "question",
            entityInfo: expect.objectContaining({
              id: 2,
              name: "Diagnostic Question 1",
            }),
          }),
        );
        expect(report).not.toHaveProperty("queryResults");
      });

      it("includes query results when the user opts in", async () => {
        visit("/question/2-diagnostic-question-1", ADMIN);
        await downloadReport(await openWithKeyboard());

        const modal = await openWithKeyboard();
        const queryResults = await screen.findByRole("checkbox", {
          name: "Query results",
        });
        expect(queryResults).not.toBeChecked();
        await userEvent.click(queryResults);
        expect(queryResults).toBeChecked();

        const report = await downloadReport(modal);

        expect(report).toEqual(
          expect.objectContaining({
            ...EXPECTED_ADMIN_DIAGNOSTICS,
            entityName: "question",
            entityInfo: expect.objectContaining({ id: 2 }),
            queryResults: expect.objectContaining({
              data: expect.objectContaining({ rows: [[1], [2]] }),
            }),
          }),
        );
        const datasetCall = fetchMock.callHistory.lastCall("path:/api/dataset");
        expect(getRequestBody(datasetCall)).toEqual(ORDERS_QUERY);
      });
    });

    describe("on a dashboard page", () => {
      const DASHBOARD = createMockDashboard({
        id: 3,
        name: "Diagnostic Dashboard",
        dashcards: [
          createMockDashboardCard({ id: 31, dashboard_id: 3 }),
          createMockDashboardCard({ id: 32, dashboard_id: 3 }),
        ],
      });

      beforeEach(() => {
        setupDashboardEndpoints(DASHBOARD);
      });

      it("includes the hydrated dashboard definition", async () => {
        visit("/dashboard/3-diagnostic-dashboard", ADMIN);
        const modal = await openWithKeyboard();
        expect(
          await screen.findByRole("checkbox", { name: "Dashboard definition" }),
        ).toBeChecked();

        const report = await downloadReport(modal);

        expect(report).toEqual(
          expect.objectContaining({
            ...EXPECTED_ADMIN_DIAGNOSTICS,
            entityName: "dashboard",
            entityInfo: expect.objectContaining({
              id: 3,
              dashcards: [
                expect.objectContaining({ id: 31 }),
                expect.objectContaining({ id: 32 }),
              ],
            }),
          }),
        );
      });

      it("leaves out server logs for non-admin users", async () => {
        visit("/dashboard/3-diagnostic-dashboard", NORMAL_USER);
        const modal = await openWithKeyboard();
        expect(
          await screen.findByRole("checkbox", { name: "Dashboard definition" }),
        ).toBeVisible();
        expect(
          screen.getByRole("checkbox", { name: "Browser error messages" }),
        ).toBeVisible();
        expect(
          screen.queryByRole("checkbox", { name: "Query results" }),
        ).not.toBeInTheDocument();
        expect(
          screen.queryAllByRole("checkbox", { name: /server logs/i }),
        ).toHaveLength(0);

        const report = await downloadReport(modal);

        expect(report).toEqual(
          expect.objectContaining({
            entityName: "dashboard",
            url: expect.stringContaining("/dashboard/3"),
            frontendErrors: EXPECTED_ADMIN_DIAGNOSTICS.frontendErrors,
            bugReportDetails: null,
            entityInfo: expect.objectContaining({ id: 3 }),
          }),
        );
        expect(report).not.toHaveProperty("logs");
        expect(report).not.toHaveProperty("userLogs");
        expect(report).not.toHaveProperty("backendErrors");
        expect(fetchMock.callHistory.called("list-logs")).toBe(false);
      });
    });
  });
});

function createLog(opts: Pick<Log, "level" | "msg">): Log {
  return {
    timestamp: "2026-11-17T10:00:00Z",
    process_uuid: "process-1",
    fqns: "metabase.test",
    exception: null,
    ...opts,
  };
}

function getRequestBody(call: CallLog | undefined): unknown {
  const body = call?.options.body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}
