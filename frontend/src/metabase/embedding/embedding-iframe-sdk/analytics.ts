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
    withDownloads: false,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L159} */
    withTitle: true,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L161} */
    withSubscriptions: false,
    /**
     * @see {@link https://github.com/metabase/metabase/blob/c8b1767e66352738553211dea3d7b1addc81da27/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L125}
     * Since this is optional, the default value is undefined.
     *
     * Unused, but documented for completeness.
     */
    autoRefreshInterval: false, // NEW: EMB-1334
    /** @see {@link https://github.com/metabase/metabase/blob/c8b1767e66352738553211dea3d7b1addc81da27/frontend/src/embedding-sdk-bundle/components/public/dashboard/SdkDashboard.tsx#L175} */
    enableEntityNavigation: false, // NEW: EMB-1334
  },
  question: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L241} */
    drills: true,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion.tsx#L132} */
    withDownloads: false,
    /**
     * @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L234}
     * @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L255}
     */
    withTitle: true,
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L256} */
    isSaveEnabled: false,
    /** @see {@link https://github.com/metabase/metabase/blob/c1b57eeb3f6f99126cc52e3a960b98f5c8bbc109/frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion.tsx#L137} */
    withAlerts: false,
    /**
     * @see {@link https://github.com/metabase/metabase/blob/c8b1767e66352738553211dea3d7b1addc81da27/frontend/src/embedding-sdk-bundle/components/public/SdkQuestion/types.ts#L3-L16}
     * Since this is optional, the default value is undefined.
     *
     * Unused, but documented for completeness.
     */
    questionId: undefined, // NEW: EMB-1334 - used to derive id_new/id_new_native
  },
  exploration: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/SdkIframeEmbedRoute.tsx#L256} */
    isSaveEnabled: false,
  },
  browser: {
    /** @see {@link https://github.com/metabase/metabase/blob/9e62f8c2b7d3739670d9f4259e1d4e28f5b654cc/frontend/src/metabase/embedding/embedding-iframe-sdk/components/MetabaseBrowser.tsx#L39} */
    readOnly: true,
    /** @see {@link https://github.com/metabase/metabase/blob/c8b1767e66352738553211dea3d7b1addc81da27/frontend/src/metabase/embedding/embedding-iframe-sdk/types/embed.ts#L166} */
    enableEntityNavigation: false, // NEW: EMB-1334
  },
  // NEW: EMB-1334 - new component
  metabot: {
    /** @see {@link https://github.com/metabase/metabase/blob/c8b1767e66352738553211dea3d7b1addc81da27/frontend/src/embedding-sdk-bundle/components/public/MetabotQuestion/types.ts#L17} */
    layout: "auto",
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
            "dashboard",
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
            "dashboard",
            "withDownloads",
            (withDownloads) =>
              String(withDownloads ?? DEFAULT_VALUES.dashboard.withDownloads),
          ),
        },
        {
          name: "with_title",
          values: countPropertyValues(
            dashboardEmbeds,
            "dashboard",
            "withTitle",
            (withTitle) =>
              String(withTitle ?? DEFAULT_VALUES.dashboard.withTitle),
          ),
        },
        {
          name: "with_subscriptions",
          values: countPropertyValues(
            dashboardEmbeds,
            "dashboard",
            "withSubscriptions",
            (withSubscriptions) =>
              String(
                withSubscriptions ?? DEFAULT_VALUES.dashboard.withSubscriptions,
              ),
          ),
        },
        {
          name: "auto_refresh_interval", // NEW: EMB-1334
          values: countPropertyValues(
            dashboardEmbeds,
            "dashboard",
            "autoRefreshInterval",
            (autoRefreshInterval) => String(autoRefreshInterval != null),
          ),
        },
        {
          name: "enable_entity_navigation", // NEW: EMB-1334
          values: countPropertyValues(
            dashboardEmbeds,
            "dashboard",
            "enableEntityNavigation",
            (enableEntityNavigation) =>
              String(
                enableEntityNavigation ??
                  DEFAULT_VALUES.dashboard.enableEntityNavigation,
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
            "question",
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
            "question",
            "withDownloads",
            (withDownloads) =>
              String(withDownloads ?? DEFAULT_VALUES.question.withDownloads),
          ),
        },
        {
          name: "with_title",
          values: countPropertyValues(
            questionEmbeds,
            "question",
            "withTitle",
            (withTitle) =>
              String(withTitle ?? DEFAULT_VALUES.question.withTitle),
          ),
        },
        {
          name: "is_save_enabled",
          values: countPropertyValues(
            questionEmbeds,
            "question",
            "isSaveEnabled",
            (isSaveEnabled) =>
              String(isSaveEnabled ?? DEFAULT_VALUES.question.isSaveEnabled),
          ),
        },
        {
          name: "with_alerts",
          values: countPropertyValues(
            questionEmbeds,
            "question",
            "withAlerts",
            (withAlerts) =>
              String(withAlerts ?? DEFAULT_VALUES.question.withAlerts),
          ),
        },
        {
          name: "id_new_native", // NEW: EMB-1334
          values: countPropertyValues(
            questionEmbeds,
            "question",
            "questionId",
            (questionId) => String(questionId === "new-native"),
          ),
        },
        {
          name: "id_new", // NEW: EMB-1334
          values: countPropertyValues(
            questionEmbeds,
            "question",
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
            "exploration",
            "isSaveEnabled",
            (isSaveEnabled) =>
              String(isSaveEnabled ?? DEFAULT_VALUES.exploration.isSaveEnabled),
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
          values: countPropertyValues(
            browserEmbeds,
            "browser",
            "readOnly",
            (readOnly) => String(readOnly ?? DEFAULT_VALUES.browser.readOnly),
          ),
        },
        {
          name: "enable_entity_navigation", // NEW: EMB-1334
          values: countPropertyValues(
            browserEmbeds,
            "browser",
            "enableEntityNavigation",
            (enableEntityNavigation) =>
              String(
                enableEntityNavigation ??
                  DEFAULT_VALUES.browser.enableEntityNavigation,
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
            "metabot",
            "layout",
            (layout) => String(layout ?? DEFAULT_VALUES.metabot.layout),
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

function countPropertyValues<
  ComponentName extends keyof DefaultValues,
  PropertyName extends Extract<keyof DefaultValues[ComponentName], string>,
>(
  embeds: MetabaseEmbedElement[],
  _component: ComponentName,
  propertyName: PropertyName,
  getValue: (
    propertyValue: any,
    properties: MetabaseEmbedElement["properties"],
  ) => string,
): PropertyValue[] {
  const counts = new Map<string, number>();

  embeds.forEach((embed) => {
    const propertyValue = (embed.properties as Record<string, any>)[
      propertyName
    ];
    const value = getValue(propertyValue, embed.properties);
    const group = String(value);
    counts.set(group, (counts.get(group) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([group, value]) => ({
    group,
    value,
  }));
}
