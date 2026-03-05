import { merge } from "icepick";
import { P, match } from "ts-pattern";
import _ from "underscore";

import type {
  AUTH_TYPES,
  DefaultValues,
  EmbeddedAnalyticsJsEventSchema,
  PropertyValue,
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
    auto_refresh_interval: false, // NEW: EMB-1334 - default: no auto-refresh configured
    enable_entity_navigation: false, // NEW: EMB-1334 - default: entity navigation disabled
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
    id_new_native: false, // NEW: EMB-1334 - computed from questionId, default: not new-native
    id_new: false, // NEW: EMB-1334 - computed from questionId, default: not new
  },
  exploration: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L256} */
    is_save_enabled: false,
  },
  browser: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/MetabaseBrowser.tsx#L39} */
    read_only: true,
    enable_entity_navigation: false, // NEW: EMB-1334 - default: entity navigation disabled
  },
  // NEW: EMB-1334 - new component
  metabot: {
    layout: "auto", // default: auto layout (responsive)
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
  const event: EmbeddedAnalyticsJsEventSchema = {
    event: "setup",
    global: {
      auth_method: getAuthMethod(firstEmbed),
      locale_used: hasLocaleUsed(activeEmbeds), // NEW: EMB-1334
    },
    components: [],
  };

  // Filter embeds by type
  const dashboardEmbeds = Array.from(activeEmbeds).filter(
    (element) => element.properties.componentName === "metabase-dashboard",
  );
  const questionEmbeds = Array.from(activeEmbeds).filter(
    (element) =>
      element.properties.componentName === "metabase-question" &&
      element.properties.questionId !== "new" &&
      element.properties.questionId !== "new-native",
  );
  const explorationEmbeds = Array.from(activeEmbeds).filter(
    (element) =>
      element.properties.componentName === "metabase-question" &&
      (element.properties.questionId === "new" ||
        element.properties.questionId === "new-native"),
  );
  const browserEmbeds = Array.from(activeEmbeds).filter(
    (element) => element.properties.componentName === "metabase-browser",
  );
  const metabotEmbeds = Array.from(activeEmbeds).filter(
    (element) => element.properties.componentName === "metabase-metabot",
  );

  // Build dashboard component
  if (dashboardEmbeds.length > 0) {
    event.components.push({
      name: "dashboard",
      properties: [
        {
          name: "drills",
          values: countPropertyValues(
            dashboardEmbeds,
            "drills",
            (drills, properties) =>
              String(
                drills ??
                  (properties.isGuest
                    ? DEFAULT_GUEST_EMBED_VALUES.dashboard.drills
                    : DEFAULT_VALUES.dashboard.drills),
              ),
          ),
        },
        {
          name: "with_downloads",
          values: countPropertyValues(
            dashboardEmbeds,
            "withDownloads",
            (withDownloads) =>
              String(withDownloads ?? DEFAULT_VALUES.dashboard.with_downloads),
          ),
        },
        {
          name: "with_title",
          values: countPropertyValues(
            dashboardEmbeds,
            "withTitle",
            (withTitle) =>
              String(withTitle ?? DEFAULT_VALUES.dashboard.with_title),
          ),
        },
        {
          name: "with_subscriptions",
          values: countPropertyValues(
            dashboardEmbeds,
            "withSubscriptions",
            (withSubscriptions) =>
              String(
                withSubscriptions ??
                  DEFAULT_VALUES.dashboard.with_subscriptions,
              ),
          ),
        },
        {
          name: "auto_refresh_interval", // NEW: EMB-1334
          values: countPropertyValues(
            dashboardEmbeds,
            "autoRefreshInterval",
            (autoRefreshInterval) => String(autoRefreshInterval != null),
          ),
        },
        {
          name: "enable_entity_navigation", // NEW: EMB-1334
          values: countPropertyValues(
            dashboardEmbeds,
            "enableEntityNavigation",
            (enableEntityNavigation) =>
              String(
                enableEntityNavigation ??
                  DEFAULT_VALUES.dashboard.enable_entity_navigation,
              ),
          ),
        },
      ],
    });
  }

  // Build question component
  if (questionEmbeds.length > 0) {
    event.components.push({
      name: "question",
      properties: [
        {
          name: "drills",
          values: countPropertyValues(
            questionEmbeds,
            "drills",
            (drills, properties) =>
              String(
                drills ??
                  (properties.isGuest
                    ? DEFAULT_GUEST_EMBED_VALUES.question.drills
                    : DEFAULT_VALUES.question.drills),
              ),
          ),
        },
        {
          name: "with_downloads",
          values: countPropertyValues(
            questionEmbeds,
            "withDownloads",
            (withDownloads) =>
              String(withDownloads ?? DEFAULT_VALUES.question.with_downloads),
          ),
        },
        {
          name: "with_title",
          values: countPropertyValues(
            questionEmbeds,
            "withTitle",
            (withTitle) =>
              String(withTitle ?? DEFAULT_VALUES.question.with_title),
          ),
        },
        {
          name: "is_save_enabled",
          values: countPropertyValues(
            questionEmbeds,
            "isSaveEnabled",
            (isSaveEnabled) =>
              String(isSaveEnabled ?? DEFAULT_VALUES.question.is_save_enabled),
          ),
        },
        {
          name: "with_alerts",
          values: countPropertyValues(
            questionEmbeds,
            "withAlerts",
            (withAlerts) =>
              String(withAlerts ?? DEFAULT_VALUES.question.with_alerts),
          ),
        },
        {
          name: "id_new_native", // NEW: EMB-1334
          values: countPropertyValues(
            questionEmbeds,
            "questionId",
            (questionId) => String(questionId === "new-native"),
          ),
        },
        {
          name: "id_new", // NEW: EMB-1334
          values: countPropertyValues(
            questionEmbeds,
            "questionId",
            (questionId) => String(questionId === "new"),
          ),
        },
      ],
    });
  }

  // Build exploration component
  if (explorationEmbeds.length > 0) {
    event.components.push({
      name: "exploration",
      properties: [
        {
          name: "is_save_enabled",
          values: countPropertyValues(
            explorationEmbeds,
            "isSaveEnabled",
            (isSaveEnabled) =>
              String(
                isSaveEnabled ?? DEFAULT_VALUES.exploration.is_save_enabled,
              ),
          ),
        },
      ],
    });
  }

  // Build browser component
  if (browserEmbeds.length > 0) {
    event.components.push({
      name: "browser",
      properties: [
        {
          name: "read_only",
          values: countPropertyValues(browserEmbeds, "readOnly", (readOnly) =>
            String(readOnly ?? DEFAULT_VALUES.browser.read_only),
          ),
        },
        {
          name: "enable_entity_navigation", // NEW: EMB-1334
          values: countPropertyValues(
            browserEmbeds,
            "enableEntityNavigation",
            (enableEntityNavigation) =>
              String(
                enableEntityNavigation ??
                  DEFAULT_VALUES.browser.enable_entity_navigation,
              ),
          ),
        },
      ],
    });
  }

  // Build metabot component - NEW: EMB-1334
  if (metabotEmbeds.length > 0) {
    event.components.push({
      name: "metabot",
      properties: [
        {
          name: "layout",
          values: countPropertyValues(
            metabotEmbeds,
            "layout",
            (layout) => layout ?? DEFAULT_VALUES.metabot.layout,
          ),
        },
      ],
    });
  }

  return event;
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

// NEW: EMB-1334 - check if any embed has locale configured
function hasLocaleUsed(activeEmbeds: Set<MetabaseEmbedElement>): boolean {
  return Array.from(activeEmbeds).some(
    (embed) => embed.properties.locale != null,
  );
}

/**
 * Count property values across embeds and return PropertyValue array
 */
function countPropertyValues(
  embeds: MetabaseEmbedElement[],
  propertyName: string,
  getValue: (
    propertyValue: any,
    properties: MetabaseEmbedElement["properties"],
  ) => string,
): PropertyValue[] {
  const counts = new Map<string, number>();

  embeds.forEach((embed) => {
    const propertyValue = (embed.properties as any)[propertyName];
    const value = getValue(propertyValue, embed.properties);
    const groupStr = String(value);
    counts.set(groupStr, (counts.get(groupStr) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([group, value]) => ({
    group,
    value,
  }));
}
