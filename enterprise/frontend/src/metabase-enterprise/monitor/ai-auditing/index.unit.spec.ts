import { PLUGIN_MONITOR, reinitialize } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { getAiAuditingRoutes, getAiAuditingUpsellRoutes } from "./routes";

import { initializePlugin } from "./index";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

const mockHasPremiumFeature = jest.mocked(hasPremiumFeature);

const mockPremiumFeatures = ({
  auditApp,
  aiControls,
}: {
  auditApp: boolean;
  aiControls: boolean;
}) => {
  mockHasPremiumFeature.mockImplementation((feature) => {
    return (
      (feature === "audit_app" && auditApp) ||
      (feature === "ai_controls" && aiControls)
    );
  });
};

describe("metabase-enterprise/monitor/ai-auditing initializePlugin", () => {
  afterEach(() => {
    jest.clearAllMocks();
    reinitialize();
  });

  it("leaves the OSS defaults when the audit_app feature is absent", () => {
    mockPremiumFeatures({ auditApp: false, aiControls: true });

    initializePlugin();

    expect(PLUGIN_MONITOR.isAiAuditingEnabled).toBe(false);
    expect(PLUGIN_MONITOR.getAiAuditingRoutes()).toBeNull();
  });

  it("registers the full AI Auditing routes when audit_app and ai_controls are present", () => {
    mockPremiumFeatures({ auditApp: true, aiControls: true });

    initializePlugin();

    expect(PLUGIN_MONITOR.isAiAuditingEnabled).toBe(true);
    expect(PLUGIN_MONITOR.getAiAuditingRoutes).toBe(getAiAuditingRoutes);
    expect(PLUGIN_MONITOR.getAiAuditingRoutes()).not.toBeNull();
  });

  it("registers the upsell routes when audit_app is present without ai_controls", () => {
    mockPremiumFeatures({ auditApp: true, aiControls: false });

    initializePlugin();

    expect(PLUGIN_MONITOR.isAiAuditingEnabled).toBe(true);
    expect(PLUGIN_MONITOR.getAiAuditingRoutes).toBe(getAiAuditingUpsellRoutes);
    expect(PLUGIN_MONITOR.getAiAuditingRoutes()).not.toBeNull();
  });
});
