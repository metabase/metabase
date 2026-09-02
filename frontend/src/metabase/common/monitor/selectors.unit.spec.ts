import { createMockState } from "metabase/redux/store/mocks";
import { createMockUser } from "metabase-types/api/mocks";

import {
  canAccessAiAuditing,
  canAccessAlertsManagement,
  canAccessContentDiagnostics,
  canAccessDependencyDiagnostics,
  canAccessMonitor,
  canAccessMonitoringTools,
} from "./selectors";

jest.mock("metabase/utils/iframe", () => ({
  isWithinIframe: jest.fn(() => false),
}));

const { isWithinIframe } = jest.requireMock("metabase/utils/iframe");

describe("canAccessMonitor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
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

  it("returns true for a monitoring-only user (content diagnostics and tools access)", () => {
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

describe("canAccessDependencyDiagnostics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessDependencyDiagnostics(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessDependencyDiagnostics(state)).toBe(true);
  });

  it("returns true when user is analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessDependencyDiagnostics(state)).toBe(true);
  });

  it("returns false for a non-admin with only the monitoring application permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessDependencyDiagnostics(state)).toBe(false);
  });
});

describe("canAccessContentDiagnostics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessContentDiagnostics(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessContentDiagnostics(state)).toBe(true);
  });

  it("returns true when user is analyst", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessContentDiagnostics(state)).toBe(true);
  });

  it("returns true for a non-admin with the monitoring application permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessContentDiagnostics(state)).toBe(true);
  });

  it("returns false without admin, analyst or the monitoring permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: false,
        permissions: { can_access_monitoring: false },
      }),
    });

    expect(canAccessContentDiagnostics(state)).toBe(false);
  });
});

describe("canAccessMonitoringTools", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
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
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
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

describe("canAccessAiAuditing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessAiAuditing(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessAiAuditing(state)).toBe(true);
  });

  it("returns false for an analyst without admin", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessAiAuditing(state)).toBe(false);
  });

  it("returns false for a non-admin with the monitoring application permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessAiAuditing(state)).toBe(false);
  });
});
