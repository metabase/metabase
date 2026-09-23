import { match } from "ts-pattern";
import { t } from "ttag";

import { formatNotificationSchedule } from "metabase/notifications/utils";
import { createMetabaseProtocolLink } from "metabase/urls";
import { b64url_to_utf8 } from "metabase/utils/encoding";
import type {
  Card,
  NotificationCardSendCondition,
  NotificationCronSubscription,
} from "metabase-types/api";

export type AlertRunAiOutput = {
  summary?: string;
  send_reason?: string;
};

type AlertSchedule = Pick<
  NotificationCronSubscription,
  "cron_schedule" | "ui_display_type"
>;

export type AlertDescription = {
  card: Pick<Card, "id" | "name" | "type">;
  send_condition?: NotificationCardSendCondition;
  subscription?: AlertSchedule;
};

function decodeJsonObject(encoded: string | null): object | null {
  if (!encoded) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(b64url_to_utf8(encoded));
    const isPlainObject =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isPlainObject ? parsed : null;
  } catch {
    return null;
  }
}

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";

export function parseAlertRunAiOutput(
  encoded: string | null,
): AlertRunAiOutput | null {
  const parsed = decodeJsonObject(encoded);
  if (!parsed) {
    return null;
  }
  const summary = "summary" in parsed ? parsed.summary : undefined;
  const sendReason = "send_reason" in parsed ? parsed.send_reason : undefined;
  if (!isOptionalString(summary) || !isOptionalString(sendReason)) {
    return null;
  }
  return { summary, send_reason: sendReason };
}

// An unsaved alert ("Send now") has no id, so the email describes it as base64url JSON instead.
export function parseAlertDescription(
  encoded: string | null,
): AlertDescription | null {
  const parsed = decodeJsonObject(encoded);
  if (!parsed || !("card" in parsed)) {
    return null;
  }
  // the payload is built by the backend's alert email renderer, so its shape matches AlertDescription
  return parsed as AlertDescription;
}

type BuildAlertPromptOpts = {
  alert: AlertDescription;
  sentAt: string | null;
  aiOutput: AlertRunAiOutput | null;
};

export function buildAlertPrompt({
  alert,
  sentAt,
  aiOutput,
}: BuildAlertPromptOpts): string {
  const { card, send_condition, subscription } = alert;
  const cardLink = createMetabaseProtocolLink({
    id: card.id,
    model: card.type === "model" ? "model" : "question",
    name: card.name,
  });
  const receivedAt = sentAt ? new Date(sentAt).toLocaleString() : null;
  const schedule = subscription?.cron_schedule
    ? formatNotificationSchedule(subscription)
    : null;

  const trigger = match(send_condition)
    .with("goal_above", () => t`It fires when the results reach the goal.`)
    .with("goal_below", () => t`It fires when the results go below the goal.`)
    .otherwise(() => t`It fires when the question has results.`);

  return [
    receivedAt
      ? t`I got an alert for ${cardLink} at ${receivedAt}.`
      : t`I got an alert for ${cardLink}.`,
    trigger,
    schedule && t`Its schedule: ${schedule}.`,
    aiOutput?.send_reason &&
      t`Metabot's note on why it was sent: "${aiOutput.send_reason}"`,
    aiOutput?.summary && t`Metabot's summary: "${aiOutput.summary}"`,
    t`Help me understand what's going on.`,
  ]
    .filter(Boolean)
    .join("\n");
}
