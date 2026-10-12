import { PLUGIN_AUDIT, reinitialize } from "metabase/plugins";

import { getAiAuditingRoutes } from "../monitor/ai-auditing/routes";

import { initializePlugin } from "./index";

describe("metabase-enterprise/audit_app initializePlugin", () => {
  afterEach(() => {
    reinitialize();
  });

  it("registers the AI auditing routes on every instance, features or not", () => {
    initializePlugin();

    expect(PLUGIN_AUDIT.getAiAuditingRoutes).toBe(getAiAuditingRoutes);
  });

  it("resets to the OSS default on reinitialize()", () => {
    initializePlugin();
    reinitialize();

    expect(PLUGIN_AUDIT.getAiAuditingRoutes()).toBeNull();
  });
});
