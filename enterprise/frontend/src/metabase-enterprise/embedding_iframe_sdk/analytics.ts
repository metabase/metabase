import { assocIn, getIn, updateIn } from "icepick";
import { P, match } from "ts-pattern";
import _ from "underscore";

import type { FlattenObjectKeys } from "metabase/embedding-sdk/types/utils";
import type {
  AUTH_TYPES,
  DefaultValues,
  EmbeddedAnalyticsJsEventSchema,
} from "metabase-types/analytics/embedded-analytics-js";

import type { MetabaseEmbedElement } from "./embed";

const DEFAULT_VALUES: DefaultValues = {
  dashboard: {
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/components/SdkIframeEmbedRoute.tsx#L119} */
    drills: true,
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L129} */
    with_downloads: false,
    /** @see {@link https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L127} */
    with_title: true,
  },
  question: {
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/components/SdkIframeEmbedRoute.tsx#L149} */
    drills: true,
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion.tsx#L129} */
    with_downloads: false,
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/components/SdkIframeEmbedRoute.tsx#L145} */
    with_title: true,
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/components/SdkIframeEmbedRoute.tsx#L157} */
    is_save_enabled: false,
  },
  exploration: {
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/components/SdkIframeEmbedRoute.tsx#L157} */
    is_save_enabled: false,
  },
  browser: {
    /** @see {@link https://github.com/metabase/metabase/blob/7aa3f7fed11113ed32901aad4e4227be68cff78f/enterprise/frontend/src/metabase-enterprise/embedding_iframe_sdk/components/MetabaseBrowser.tsx#L39} */
    read_only: true,
  },
};

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
    firstEmbed.sendMessage("metabase.embed.reportAnalytics", {
      usageAnalytics: createEmbeddedAnalyticsJsUsage(activeEmbeds),
      embedHostUrl: window.location.href,
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
          });
        }
        usage = incrementComponentPropertyCount(
          "dashboard.drills",
          properties.drills,
          usage,
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
      })
      .with(
        { componentName: "metabase-question", questionId: "new" },
        (properties) => {
          if (!usage.exploration) {
            usage = assocIn(usage, ["exploration"], {
              is_save_enabled: { true: 0, false: 0 },
            });
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
            });
          }
          usage = incrementComponentPropertyCount(
            "question.drills",
            properties.drills,
            usage,
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
        },
      )
      .with({ componentName: "metabase-browser" }, (properties) => {
        if (!usage.browser) {
          usage = assocIn(usage, ["browser"], {
            read_only: { true: 0, false: 0 },
          });
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
    .otherwise(() => {
      return "sso";
    });
}

function incrementComponentPropertyCount(
  propertyPath: FlattenObjectKeys<DefaultValues>,
  value: any | undefined,
  usage: EmbeddedAnalyticsJsEventSchema,
) {
  const path = propertyPath.split(".");

  return updateIn(
    usage,
    [...path, String(value ?? getIn(DEFAULT_VALUES, path))],
    (value) => value + 1,
  );
}
