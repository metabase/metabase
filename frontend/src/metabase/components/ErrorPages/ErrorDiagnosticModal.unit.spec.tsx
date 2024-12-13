import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { setupBugReportEndpoints } from "__support__/server-mocks/bug-report";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import {
  createMockCard,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { ErrorDiagnosticModal } from "./ErrorDiagnosticModal";
import type { ErrorPayload, ReportableEntityName } from "./types";

const defaultErrorPayload: ErrorPayload = {
  url: "http://example.com/question/1",
  frontendErrors: ["Frontend error 1", "Frontend error 2"],
  backendErrors: [
    {
      level: "ERROR",
      timestamp: "2021-08-31T16:00:00Z",
      process_uuid: "123",
      fqns: "metabase.query-processor.middleware.catch-exceptions",
      msg: "Backend error 1",
      exception: "Backend error 1 stacktrace",
    },
  ],
  userLogs: [
    {
      level: "ERROR",
      timestamp: "2021-08-31T16:00:00Z",
      process_uuid: "123",
      fqns: "metabase.query-processor.middleware.catch-exceptions",
      msg: "Backend error 1",
      exception: "Backend error 1 stacktrace",
    },
  ],
  logs: [
    {
      level: "ERROR",
      timestamp: "2021-08-31T16:00:00Z",
      process_uuid: "123",
      fqns: "metabase.query-processor.middleware.catch-exceptions",
      msg: "Backend error 1",
      exception: "Backend error 1 stacktrace",
    },
  ],
  entityName: "question",
  localizedEntityName: "Question",
  entityInfo: createMockCard(),
  queryResults: createMockDatasetData({ rows: [[1]] }),
  browserInfo: {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    language: "en-US",
    browserName: "Chrome",
    browserVersion: "91.0.4472.124",
    platform: "Mac",
    os: "Mac OS X",
    osVersion: "10.15.7",
  },
  bugReportDetails: {
    "application-database": "h2",
    "application-database-details": {},
    databases: ["h2"],
    "hosting-env": "production",
    "run-mode": "prod",
    settings: {},
    version: {
      date: "2021-08-31",
      hash: "abcdef",
      src_hash: "abcdef",
      tag: "v1.0.0",
    },
  },
};

const setup = (errorInfo: ErrorPayload, options = {}) => {
  renderWithProviders(
    <ErrorDiagnosticModal
      errorInfo={errorInfo}
      onClose={() => undefined}
      loading={false}
    />,
    options,
  );
};

describe("ErrorDiagnosticsModal", () => {
  it("should show diagnostic modal", () => {
    setup(defaultErrorPayload);
    expect(
      screen.getByText("Download diagnostic information"),
    ).toBeInTheDocument();
  });

  it("should show sensitive data warning message", () => {
    setup(defaultErrorPayload);
    expect(screen.getByText(/may contain sensitive data/)).toBeInTheDocument();
  });

  const entityNames: ReportableEntityName[] = [
    "question",
    "dashboard",
    "collection",
    "model",
  ];

  entityNames.forEach(entityName => {
    it(`should show entity definition checkbox for ${entityName} definition`, () => {
      setup({
        ...defaultErrorPayload,
        entityName,
        localizedEntityName: entityName,
      });
      expect(
        screen.getByText(new RegExp(`${entityName} definition`, "i")),
      ).toBeInTheDocument();
    });
  });

  it("should not show entity definition checkbox for undefined entity", () => {
    setup({
      ...defaultErrorPayload,
      entityName: undefined,
      localizedEntityName: undefined,
    });
    expect(screen.queryByText(/definition/i)).not.toBeInTheDocument();
  });

  it("should show query results checkbox for questions", () => {
    setup({
      ...defaultErrorPayload,
      entityName: "question",
      localizedEntityName: "Question",
    });
    expect(screen.getByText(/query results/i)).toBeInTheDocument();
  });

  it("should show query results checkbox for models", () => {
    setup({
      ...defaultErrorPayload,
      entityName: "model",
      localizedEntityName: "Model",
    });
    expect(screen.getByText(/query results/i)).toBeInTheDocument();
  });

  it("should not show query results checkbox for dashboards", () => {
    setup({
      ...defaultErrorPayload,
      entityName: "dashboard",
      localizedEntityName: "Dashboard",
    });
    expect(screen.queryByText(/query results/i)).not.toBeInTheDocument();
  });

  it("should not show backend logs checkboxes when we don't have any logs", () => {
    setup({
      ...defaultErrorPayload,
      backendErrors: undefined,
      userLogs: undefined,
      logs: undefined,
    });
    expect(
      screen.queryByText(/server error messages/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/server logs/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/server logs from the current user only/i),
    ).not.toBeInTheDocument();
  });

  describe("Bug Report Form", () => {
    beforeEach(() => {
      const state = createMockState({
        settings: mockSettings({
          "enable-embedding": true,
          "slack-app-token": "test-token",
          "slack-bug-report-channel": "test-channel",
          "bug-reporting-enabled": true,
          "slack-token-valid?": true,
        }),
      });

      setupBugReportEndpoints();

      setup(defaultErrorPayload, { storeInitialState: state });
    });

    it("should show bug report form when slack is configured", () => {
      expect(screen.getByText(/report a bug/i)).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /submit report/i }),
      ).toBeInTheDocument();
    });

    it("should show description textarea with correct label", () => {
      expect(
        screen.getByText(
          /what were you trying to do, and what steps did you take\? what was the expected result, and what happened instead\?/i,
        ),
      ).toBeInTheDocument();
    });

    it("should show both submit and download buttons", () => {
      expect(
        screen.getByRole("button", { name: /submit report/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /download/i }),
      ).toBeInTheDocument();
    });

    it("should show edit/done toggle button for diagnostic info", async () => {
      const toggleButton = screen.getByRole("button", { name: /edit/i });
      expect(toggleButton).toBeInTheDocument();

      await userEvent.click(toggleButton);
      expect(screen.getByRole("button", { name: /done/i })).toBeInTheDocument();
    });

    it("should show success message after submission", async () => {
      const submitButton = screen.getByRole("button", {
        name: /submit report/i,
      });
      await userEvent.click(submitButton);

      expect(
        await screen.findByText(/thank you for your feedback/i),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(/bug report submitted successfully/i),
      ).toBeInTheDocument();
    });
  });
});
