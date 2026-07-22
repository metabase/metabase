import {
  monitorAiAuditing,
  monitorAiAuditingConversationDetail,
  monitorAiAuditingConversations,
  monitorAiAuditingMcp,
  monitorAiAuditingUsage,
} from "./monitor";

describe("Monitor URLs", () => {
  it("keeps AI Auditing routes as siblings under the section root", () => {
    expect(monitorAiAuditing()).toBe("/monitor/ai-auditing");
    expect(monitorAiAuditingUsage()).toBe("/monitor/ai-auditing/usage");
    expect(monitorAiAuditingConversations()).toBe(
      "/monitor/ai-auditing/conversations",
    );
    expect(monitorAiAuditingConversationDetail("42")).toBe(
      "/monitor/ai-auditing/conversations/42",
    );
    expect(monitorAiAuditingMcp()).toBe("/monitor/ai-auditing/mcp");
  });
});
