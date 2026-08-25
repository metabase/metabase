import { PLUGIN_AUDIT, reinitialize } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  getAiAuditingRoutes,
  getAiAuditingUpsellRoutes,
} from "../monitor/ai-auditing/routes";

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

describe("metabase-enterprise/audit_app initializePlugin", () => {
  afterEach(() => {
    jest.clearAllMocks();
    reinitialize();
  });

  it("leaves the OSS AI Auditing defaults when audit_app is absent", () => {
    mockPremiumFeatures({ auditApp: false, aiControls: true });

    initializePlugin();

    expect(PLUGIN_AUDIT.isAiAuditingEnabled).toBe(false);
    expect(PLUGIN_AUDIT.getAiAuditingRoutes()).toBeNull();
  });

  it("registers the full AI Auditing routes when audit_app and ai_controls are present", () => {
    mockPremiumFeatures({ auditApp: true, aiControls: true });

    initializePlugin();

    expect(PLUGIN_AUDIT.isAiAuditingEnabled).toBe(true);
    expect(PLUGIN_AUDIT.getAiAuditingRoutes).toBe(getAiAuditingRoutes);
    expect(PLUGIN_AUDIT.getAiAuditingRoutes()).not.toBeNull();
  });

  it("registers the upsell routes when audit_app is present without ai_controls", () => {
    mockPremiumFeatures({ auditApp: true, aiControls: false });

    initializePlugin();

    expect(PLUGIN_AUDIT.isAiAuditingEnabled).toBe(true);
    expect(PLUGIN_AUDIT.getAiAuditingRoutes).toBe(getAiAuditingUpsellRoutes);
    expect(PLUGIN_AUDIT.getAiAuditingRoutes()).not.toBeNull();
  });
});
