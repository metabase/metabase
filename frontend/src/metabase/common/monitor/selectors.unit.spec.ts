import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  canAccessAiAuditing,
  canAccessAlertsManagement,
  canAccessApiKeyUsage,
  canAccessMonitor,
  canAccessMonitorDiagnostics,
  canAccessMonitoringTools,
  canAccessSessionManagement,
} from "./selectors";

jest.mock("metabase/utils/iframe", () => ({
  isWithinIframe: jest.fn(() => false),
}));

const { isWithinIframe } = jest.requireMock("metabase/utils/iframe");

const createAnalystState = ({
  hasAdvancedPermissions = true,
}: { hasAdvancedPermissions?: boolean } = {}) =>
  createMockState({
    currentUser: createMockUser({
      is_superuser: false,
      is_data_analyst: true,
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        advanced_permissions: hasAdvancedPermissions,
      }),
    }),
  });

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
    expect(canAccessMonitor(createAnalystState())).toBe(true);
  });

  it("returns false for an analyst whose plan lost the feature", () => {
    const state = createAnalystState({ hasAdvancedPermissions: false });

    expect(canAccessMonitor(state)).toBe(false);
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
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
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
    expect(canAccessMonitorDiagnostics(createAnalystState())).toBe(true);
  });

  it("returns false for an analyst whose plan lost the feature", () => {
    const state = createAnalystState({ hasAdvancedPermissions: false });

    expect(canAccessMonitorDiagnostics(state)).toBe(false);
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

describe("canAccessSessionManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessSessionManagement(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessSessionManagement(state)).toBe(true);
  });

  it("returns false for an analyst without admin", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessSessionManagement(state)).toBe(false);
  });

  it("returns false for a non-admin with the monitoring application permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessSessionManagement(state)).toBe(false);
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

describe("canAccessApiKeyUsage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isWithinIframe.mockReturnValue(false);
  });

  it("returns false when in embedding iframe", () => {
    isWithinIframe.mockReturnValue(true);
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessApiKeyUsage(state)).toBe(false);
  });

  it("returns true when user is admin", () => {
    const state = createMockState({
      currentUser: createMockUser({ is_superuser: true }),
    });

    expect(canAccessApiKeyUsage(state)).toBe(true);
  });

  it("returns false for an analyst without admin", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        is_data_analyst: true,
      }),
    });

    expect(canAccessApiKeyUsage(state)).toBe(false);
  });

  it("returns false for a non-admin with the monitoring application permission", () => {
    const state = createMockState({
      currentUser: createMockUser({
        is_superuser: false,
        permissions: { can_access_monitoring: true },
      }),
    });

    expect(canAccessApiKeyUsage(state)).toBe(false);
  });
});
