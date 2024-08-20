import * as Snowplow from "@snowplow/browser-tracker";

import { shouldLogAnalytics } from "metabase/env";
import Settings from "metabase/lib/settings";
import { getUserId } from "metabase/selectors/user";

export const createTracker = store => {
  if (Settings.snowplowEnabled()) {
    createSnowplowTracker(store);
  }
};

export const trackPageView = url => {
  if (!url || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    trackSnowplowPageView(getSanitizedUrl(url));
  }
};

export const trackSchemaEvent = (schema, version, data, contextEntities) => {
  /*
  IMPORTANT NOTE:
  Only use this function directly if `trackActionEvent` doesn't fit your needs.
  We want to use the generic structured action event as much as possible to avoid to create or update schemas.
  If you need to track event specific context that does not fit the structured action event, you can pass context entities
  that are designed in a reusable way (https://docs.snowplow.io/docs/understanding-your-pipeline/entities/)
  */
  if (shouldLogAnalytics) {
    const { event, ...other } = data;
    // eslint-disable-next-line no-console
    console.log(
      `%c[SNOWPLOW EVENT]%c, ${event}`,
      "background: #222; color: #bada55",
      "color: ",
      other,
    );
  }

  if (!schema || !Settings.trackingEnabled()) {
    return;
  }

  if (Settings.snowplowEnabled()) {
    trackSnowplowSchemaEvent(schema, version, data, contextEntities);
  }
};

/**
 * @param {string} name - Name of the action. Noun (target) + Verb in the past (action) which define the action taken - e.g. question-created, dashboard-updated, dashboard-auto-apply-filter-enabled
 * @param {string} triggeredFrom - From where the action was taken. This can be generic like 'dashboard' or also more specific like 'dashboard_top_nav'.
 * @param {string} targetId - (Optional) ID of the entity that the action was performed on. E.g. the ID of the question that was created in a question_created event.
 * @param {number} durationMs - (Optional) Duration in milliseconds
 * @param {string} result - (Optional) The outcome of the action (e.g. success, failure, …)
 * @param {string} eventDetail - (Optional) Can be used for additional details that describe the event, e.g. the type of question that was created in a question_created event.
 * @param {object} contextEntities - (Optional) Additional context entities (https://docs.snowplow.io/docs/understanding-your-pipeline/entities/). We send the Metabase Instance context by default with each event.
 */
export const trackActionEvent = (
  name,
  triggeredFrom,
  targetId,
  durationMs,
  result,
  eventDetail,
  contextEntities,
) => {
  const event = {
    name,
    triggered_from: triggeredFrom,
    target_id: targetId,
    duration_ms: durationMs,
    result,
    event_detail: eventDetail,
  };
  trackSchemaEvent("structured_action", "1-0-0", event, contextEntities);
};

const createSnowplowTracker = store => {
  Snowplow.newTracker("sp", Settings.snowplowUrl(), {
    appId: "metabase",
    platform: "web",
    eventMethod: "post",
    discoverRootDomain: true,
    contexts: { webPage: true },
    anonymousTracking: { withServerAnonymisation: true },
    stateStorageStrategy: "none",
    plugins: [createSnowplowPlugin(store)],
  });
};

const createSnowplowPlugin = store => {
  return {
    beforeTrack: () => {
      const userId = getUserId(store.getState());
      userId && Snowplow.setUserId(String(userId));
    },
    contexts: () => {
      const id = Settings.get("analytics-uuid");
      const version = Settings.get("version", {});
      const createdAt = Settings.get("instance-creation");
      const tokenFeatures = Settings.get("token-features");

      return [
        {
          schema: "iglu:com.metabase/instance/jsonschema/1-1-0",
          data: {
            id,
            version: {
              tag: version.tag,
            },
            created_at: createdAt,
            token_features: tokenFeatures,
          },
        },
      ];
    },
  };
};

const trackSnowplowPageView = url => {
  Snowplow.setReferrerUrl("#");
  Snowplow.setCustomUrl(url);
  Snowplow.trackPageView();
};

const trackSnowplowSchemaEvent = (schema, version, data, contextEntities) => {
  Snowplow.trackSelfDescribingEvent({
    event: {
      schema: `iglu:com.metabase/${schema}/jsonschema/${version}`,
      data,
    },
    context: contextEntities, // Optional - allows to add additional context entities
  });
};

const getSanitizedUrl = url => {
  const urlWithoutSlug = url.replace(/(\/\d+)-[^\/]+$/, (match, path) => path);
  const urlWithoutHost = new URL(urlWithoutSlug, Settings.snowplowUrl());

  return urlWithoutHost.href;
};
