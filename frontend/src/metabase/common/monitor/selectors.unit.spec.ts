import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import {
  canAccessAlertsManagement,
  canAccessMonitor,
  canAccessMonitorDiagnostics,
  canAccessMonitoringTools,
} from "./selectors";

jest.mock("metabase/selectors/embed", () => ({
  getIsEmbeddingIframe: jest.fn(() => false),
}));

// Jest's requireMock API is untyped, so define the mock module boundary.
const { getIsEmbeddingIframe } = jest.requireMock(
  "metabase/selectors/embed",
) as { getIsEmbeddingIframe: jest.Mock };

describe("canAccessMonitor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIsEmbeddingIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    getIsEmbeddingIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessMonitor(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: true,
        is_data_analyst: false,
      }),
    });

    expect(canAccessMonitor(state)).toBe(true);
  });

  it("returns true when user is analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessMonitor(state)).toBe(true);
  });

  it("returns true for a monitoring-only user (tools access)", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessMonitor(state)).toBe(true);
  });

  it("returns false when the user has no monitor section access", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: false },
      }),
    });

    expect(canAccessMonitor(state)).toBe(false);
  });
});

describe("canAccessMonitorDiagnostics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIsEmbeddingIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    getIsEmbeddingIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessMonitorDiagnostics(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessMonitorDiagnostics(state)).toBe(true);
  });

  it("returns true when user is analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessMonitorDiagnostics(state)).toBe(true);
  });

  it("returns false for a monitoring-only user (no diagnostics access)", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessMonitorDiagnostics(state)).toBe(false);
  });
});

describe("canAccessMonitoringTools", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIsEmbeddingIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    getIsEmbeddingIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessMonitoringTools(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessMonitoringTools(state)).toBe(true);
  });

  it("returns true for a non-admin with the monitoring application permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessMonitoringTools(state)).toBe(true);
  });

  it("returns false for an analyst without the monitoring permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
        permissions: { can_access_monitoring: false },
      }),
    });

    expect(canAccessMonitoringTools(state)).toBe(false);
  });
});

describe("canAccessAlertsManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getIsEmbeddingIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    getIsEmbeddingIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessAlertsManagement(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessAlertsManagement(state)).toBe(true);
  });

  it("returns false for an analyst without admin", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessAlertsManagement(state)).toBe(false);
  });

  it("returns false for a non-admin with the monitoring application permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessAlertsManagement(state)).toBe(false);
  });
});
