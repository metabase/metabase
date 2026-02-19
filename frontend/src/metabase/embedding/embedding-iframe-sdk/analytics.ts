import { assocIn, getIn, merge, updateIn } from "icepick";
import { P, match } from "ts-pattern";
import _ from "underscore";

import type { FlattenObjectKeys } from "metabase/embedding-sdk/types/utils";
import type {
  AUTH_TYPES,
  DefaultValues,
  EmbeddedAnalyticsJsEvent,
  EmbeddedAnalyticsJsEventSchema,
} from "metabase-types/analytics/embedded-analytics-js";

import type { MetabaseEmbedElement } from "./embed";

const DEFAULT_VALUES: DefaultValues = {
  dashboard: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L188} */
    drills: true,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L160} */
    with_downloads: false,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L159} */
    with_title: true,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L161} */
    with_subscriptions: false,
  },
  question: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L241} */
    drills: true,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion.tsx#L132} */
    with_downloads: false,
    /**
     * @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L234}
     * @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L255}
     */
    with_title: true,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L256} */
    is_save_enabled: false,
    /** @see {@link https://github.com/metabase/metabase/blob/c1b57eeb3f6f99126cc52e3a960b98f5c8bbc109/frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion.tsx#L137} */
    with_alerts: false,
  },
  exploration: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L256} */
    is_save_enabled: false,
  },
  browser: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/MetabaseBrowser.tsx#L39} */
    read_only: true,
  },
};

const DEFAULT_GUEST_EMBED_VALUES: DefaultValues = merge(DEFAULT_VALUES, {
  dashboard: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L157} */
    drills: false,
  },
  question: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L212} */
    drills: false,
  },
});

const SECOND = 1000;

/**
 * Because the way it's designed to be consumed when each embed is being registered. There could be multiple embed in a page, so we want to debounce and only call this once.
 */
export const debouncedReportAnalytics = _.debounce(
  reportAnalyticsOnce,
  1 * SECOND,
);

/**
 * This is just a safe-guard to ensure we only call this once for whatever reason.
 */
let isAnalyticsReported = false;
function reportAnalyticsOnce(activeEmbeds: Set<MetabaseEmbedElement>) {
  if (!isAnalyticsReported) {
    isAnalyticsReported = true;
    const [firstEmbed] = activeEmbeds;
    firstEmbed.addEventListener("ready", () => {
      firstEmbed.sendMessage("metabase.embed.reportAnalytics", {
        usageAnalytics: createEmbeddedAnalyticsJsUsage(activeEmbeds),
        embedHostUrl: window.location.href,
      });
    });
  }
}

export function createEmbeddedAnalyticsJsUsage(
  activeEmbeds: Set<MetabaseEmbedElement>,
): EmbeddedAnalyticsJsEventSchema {
  const [firstEmbed] = activeEmbeds;
  let usage = {
    event: "setup",
    global: {
      auth_method: getAuthMethod(firstEmbed),
    },
  } as EmbeddedAnalyticsJsEventSchema;

  activeEmbeds.forEach((embed) => {
    match(embed.properties)
      .with({ componentName: "metabase-dashboard" }, (properties) => {
        if (!usage.dashboard) {
          usage = assocIn(usage, ["dashboard"], {
            drills: { true: 0, false: 0 },
            with_downloads: { true: 0, false: 0 },
            with_title: { true: 0, false: 0 },
            with_subscriptions: { true: 0, false: 0 },
          } satisfies EmbeddedAnalyticsJsEvent["dashboard"]);
        }
        usage = incrementComponentPropertyCount(
          "dashboard.drills",
          properties.drills,
          usage,
          properties.isGuest
            ? (path) => getIn(DEFAULT_GUEST_EMBED_VALUES, path)
            : undefined,
        );
        usage = incrementComponentPropertyCount(
          "dashboard.with_downloads",
          properties.withDownloads,
          usage,
        );
        usage = incrementComponentPropertyCount(
          "dashboard.with_title",
          properties.withTitle,
          usage,
        );
        usage = incrementComponentPropertyCount(
          "dashboard.with_subscriptions",
          properties.withSubscriptions,
          usage,
        );
      })
      .with(
        { componentName: "metabase-question", questionId: "new" },
        { componentName: "metabase-question", questionId: "new-native" },
        (properties) => {
          if (!usage.exploration) {
            usage = assocIn(usage, ["exploration"], {
              is_save_enabled: { true: 0, false: 0 },
            } satisfies EmbeddedAnalyticsJsEvent["exploration"]);
          }
          usage = incrementComponentPropertyCount(
            "exploration.is_save_enabled",
            properties.isSaveEnabled,
            usage,
          );
        },
      )
      .with(
        {
          componentName: "metabase-question",
        },
        (properties) => {
          if (!usage.question) {
            usage = assocIn(usage, ["question"], {
              drills: { true: 0, false: 0 },
              with_downloads: { true: 0, false: 0 },
              with_title: { true: 0, false: 0 },
              is_save_enabled: { true: 0, false: 0 },
              with_alerts: { true: 0, false: 0 },
            } satisfies EmbeddedAnalyticsJsEvent["question"]);
          }
          usage = incrementComponentPropertyCount(
            "question.drills",
            properties.drills,
            usage,
            properties.isGuest
              ? (path) => getIn(DEFAULT_GUEST_EMBED_VALUES, path)
              : undefined,
          );
          usage = incrementComponentPropertyCount(
            "question.with_downloads",
            properties.withDownloads,
            usage,
          );
          usage = incrementComponentPropertyCount(
            "question.with_title",
            properties.withTitle,
            usage,
          );
          usage = incrementComponentPropertyCount(
            "question.is_save_enabled",
            properties.isSaveEnabled,
            usage,
          );
          usage = incrementComponentPropertyCount(
            "question.with_alerts",
            properties.withAlerts,
            usage,
          );
        },
      )
      .with({ componentName: "metabase-browser" }, (properties) => {
        if (!usage.browser) {
          usage = assocIn(usage, ["browser"], {
            read_only: { true: 0, false: 0 },
          } satisfies EmbeddedAnalyticsJsEvent["browser"]);
        }
        usage = incrementComponentPropertyCount(
          "browser.read_only",
          properties.readOnly,
          usage,
        );
      });
  });

  return usage;
}

function getAuthMethod(firstEmbed: MetabaseEmbedElement): AUTH_TYPES {
  return match(firstEmbed.properties)
    .returnType<AUTH_TYPES>()
    .with(
      {
        useExistingUserSession: true,
      },
      () => "session",
    )
    .with(
      {
        apiKey: P.string,
      },
      () => "api_key",
    )
    .with(
      {
        isGuest: true,
      },
      () => "guest",
    )
    .otherwise(() => {
      return "sso";
    });
}

function incrementComponentPropertyCount(
  propertyPath: FlattenObjectKeys<DefaultValues>,
  value: boolean | undefined,
  usage: EmbeddedAnalyticsJsEventSchema,
  getDefaultValue: (path: string[]) => boolean = defaultGetDefaultValue,
) {
  const path = propertyPath.split(".");

  return updateIn(
    usage,
    [...path, String(value ?? getDefaultValue(path))],
    (value) => value + 1,
  );
}

function defaultGetDefaultValue(path: string[]): boolean {
  return getIn(DEFAULT_VALUES, path);
}
