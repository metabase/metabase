import { screen, render } from "@testing-library/react";

import {
  createMockCard,
  createMockDatasetData,
} from "metabase-types/api/mocks";

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

const setup = (errorInfo: ErrorPayload) => {
  render(
    <ErrorDiagnosticModal
      errorInfo={errorInfo}
      onClose={() => undefined}
      loading={false}
    />,
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
});
