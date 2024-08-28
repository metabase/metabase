import * as Snowplow from "@snowplow/browser-tracker";

import { shouldLogAnalytics } from "metabase/env";
import Settings from "metabase/lib/settings";

export * from "./analytics-untyped";

/**
 * Tracks a schema event.
 * IMPORTANT NOTE:
 * Only use this function directly if `trackActionEvent` doesn't fit your needs.
 * We want to use the generic structured action event as much as possible to avoid to create or update schemas.
 * If you need to track event specific context that does not fit the structured action event, you can pass context entities
 * that are designed in a reusable way (https://docs.snowplow.io/docs/understanding-your-pipeline/entities/)
 */
export const trackSchemaEvent = <TData extends object>(
  /** The schema of the event. */
  schema: string,
  /** The version of the event. */
  version: string,
  /**  The data associated with the event. */
  data: TData,
  /** The context entities associated with the event. */
  contextEntities?: Snowplow.SelfDescribingJson<Record<string, unknown>>[],
): void => {
  if (shouldLogAnalytics) {
    const nameToLog =
      schema === "structured_action" ? (data as any).name : (data as any).event;
    // eslint-disable-next-line no-console
    console.log(
      `%c[SNOWPLOW EVENT] %c${schema} %c${nameToLog}`,
      "background: #222; color: #bada55",
      "color:#a80057",
      "color:#c6c900",
      data,
    );
  }

  if (!schema || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    trackSnowplowSchemaEvent(schema, version, data, contextEntities);
  }
};

export const trackActionEvent = (
  /** Name of the action. Noun (target) + Verb in the past (action) which define the action taken - e.g. question-created, dashboard-updated, dashboard-auto-apply-filter-enabled */
  name: string,
  {
    triggeredFrom,
    targetId,
    durationMs,
    result,
    eventDetail,
    contextEntities,
  }: {
    /**From where the action was taken. This can be generic like 'dashboard' or also more specific like 'dashboard_top_nav'.*/
    triggeredFrom?: string;
    /** ID of the entity that the action was performed on. E.g. the ID of the question that was created in a question_created event. */
    targetId?: string;
    /** Duration in milliseconds */
    durationMs?: number;
    /** The outcome of the action (e.g. success, failure, …) */
    result?: string;
    /** Can be used for additional details that describe the event, e.g. the type of question that was created in a question_created event. */
    eventDetail?: string;
    /** (Optional) Additional context entities (https://docs.snowplow.io/docs/understanding-your-pipeline/entities/). We send the Metabase Instance context by default with each event. */
    contextEntities?: Snowplow.SelfDescribingJson<Record<string, unknown>>[];
  },
) => {
  const data = {
    name: name,
    triggered_from: triggeredFrom,
    target_id: targetId,
    duration_ms: durationMs,
    result,
    event_detail: eventDetail,
  };
  trackSchemaEvent("structured_action", "1-0-0", data, contextEntities);
};

window.trackActionEvent = trackActionEvent;

const trackSnowplowSchemaEvent = (
  schema: string,
  version: string,
  data: any,
  contextEntities: Snowplow.SelfDescribingJson<Record<string, unknown>>[] = [],
) => {
  Snowplow.trackSelfDescribingEvent({
    event: {
      schema: `iglu:com.metabase/${schema}/jsonschema/${version}`,
      data,
    },
    context: contextEntities, // Optional - allows to add additional context entities
  });
};
