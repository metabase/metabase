import { utf8_to_b64url } from "metabase/utils/encoding";
import type { NotificationCardSendCondition } from "metabase-types/api";
import {
  createMockCard,
  createMockNotificationCronSubscription,
} from "metabase-types/api/mocks";

import {
  buildAlertPrompt,
  parseAlertDescription,
  parseAlertRunAiOutput,
} from "./alert-prompt";

const card = createMockCard({ id: 42, name: "Weekly revenue" });

const setup = ({
  sendCondition = "has_result",
  sentAt = null,
  aiOutput = null,
}: {
  sendCondition?: NotificationCardSendCondition;
  sentAt?: string | null;
  aiOutput?: Parameters<typeof buildAlertPrompt>[0]["aiOutput"];
} = {}) =>
  buildAlertPrompt({
    alert: {
      card,
      send_condition: sendCondition,
      subscription: createMockNotificationCronSubscription(),
    },
    sentAt,
    aiOutput,
  });

describe("buildAlertPrompt", () => {
  it("links the alert's question so Metabot can read it", () => {
    expect(setup()).toContain("[Weekly revenue](metabase://question/42)");
  });

  it("links a model as a model", () => {
    const prompt = buildAlertPrompt({
      alert: { card: { ...card, type: "model" } },
      sentAt: null,
      aiOutput: null,
    });
    expect(prompt).toContain("[Weekly revenue](metabase://model/42)");
  });

  it.each<[NotificationCardSendCondition, string]>([
    ["has_result", "It fires when the question has results."],
    ["goal_above", "It fires when the results reach the goal."],
    ["goal_below", "It fires when the results go below the goal."],
  ])("describes the %s trigger", (sendCondition, expected) => {
    expect(setup({ sendCondition })).toContain(expected);
  });

  it("includes the schedule and when the alert was sent", () => {
    const prompt = setup({ sentAt: "2026-09-23T09:00:00Z" });
    expect(prompt).toContain("Its schedule: Check daily at 9:00 AM.");
    expect(prompt).toContain(
      `at ${new Date("2026-09-23T09:00:00Z").toLocaleString()}`,
    );
  });

  it("works without any Metabot output", () => {
    const prompt = setup();
    expect(prompt).not.toContain("Metabot's");
    expect(prompt).toContain("Help me understand what's going on.");
  });

  it("includes Metabot's summary and send reason when present", () => {
    const prompt = setup({
      aiOutput: { summary: "Revenue fell 20%.", send_reason: "Big drop." },
    });
    expect(prompt).toContain(`Metabot's summary: "Revenue fell 20%."`);
    expect(prompt).toContain(`Metabot's note on why it was sent: "Big drop."`);
  });
});

describe("parseAlertRunAiOutput", () => {
  it("decodes base64url JSON, including non-ASCII text", () => {
    const encoded = utf8_to_b64url(
      JSON.stringify({ summary: "Ventes en baisse — 20 %", send_reason: "x" }),
    );
    expect(parseAlertRunAiOutput(encoded)).toEqual({
      summary: "Ventes en baisse — 20 %",
      send_reason: "x",
    });
  });

  it("decodes unpadded input, as the backend sends it", () => {
    const encoded = utf8_to_b64url(JSON.stringify({ summary: "a" })).replace(
      /=+$/,
      "",
    );
    expect(parseAlertRunAiOutput(encoded)).toEqual({ summary: "a" });
  });

  it.each([null, "", "not base64!", utf8_to_b64url("[1,2]")])(
    "ignores malformed input %p",
    (encoded) => {
      expect(parseAlertRunAiOutput(encoded)).toBeNull();
    },
  );

  it("ignores non-string fields", () => {
    expect(
      parseAlertRunAiOutput(utf8_to_b64url(JSON.stringify({ summary: 1 }))),
    ).toBeNull();
  });
});

describe("parseAlertDescription", () => {
  it("decodes an unsaved alert's description", () => {
    const alert = {
      card: { id: 7, name: "Weekly revenue", type: "question" },
      send_condition: "goal_above",
    };
    expect(
      parseAlertDescription(utf8_to_b64url(JSON.stringify(alert))),
    ).toEqual(alert);
  });

  it("ignores input without a card", () => {
    expect(
      parseAlertDescription(utf8_to_b64url(JSON.stringify({ a: 1 }))),
    ).toBeNull();
  });
});
