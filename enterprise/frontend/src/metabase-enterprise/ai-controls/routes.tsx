import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { RequireMetabotConfigured } from "./components/RequireMetabotConfigured";

/**
 * The AI settings pages, in one chunk.
 *
 * These pages are tabs of one settings screen, so every loader below names the
 * same chunk. The section then arrives in one request, and moving between the
 * tabs costs no further fetch.
 *
 * `RequireMetabotConfigured` is not split. It redirects away when Metabot is
 * unconfigured, so splitting it would put a fetch in front of a redirect that
 * renders nothing.
 */
const metabotFeatureAccessPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotFeatureAccessPage"
  ).then(({ MetabotFeatureAccessPage }) => ({
    Component: MetabotFeatureAccessPage,
  }));

const metabotFeatureAccessUpsellPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotFeatureAccessPage"
  ).then(({ MetabotFeatureAccessUpsellPage }) => ({
    Component: MetabotFeatureAccessUpsellPage,
  }));

const metabotUsageLimitsPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotUsageLimitsPage"
  ).then(({ MetabotUsageLimitsPage }) => ({
    Component: MetabotUsageLimitsPage,
  }));

const metabotCustomizationPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotCustomizationPage"
  ).then(({ MetabotCustomizationPage }) => ({
    Component: MetabotCustomizationPage,
  }));

const metabotCustomizationUpsellPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotCustomizationPage"
  ).then(({ MetabotCustomizationUpsellPage }) => ({
    Component: MetabotCustomizationUpsellPage,
  }));

const metabotChatPromptPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotSystemPromptsPage"
  ).then(({ MetabotChatPromptPage }) => ({ Component: MetabotChatPromptPage }));

const naturalLanguagePromptPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotSystemPromptsPage"
  ).then(({ NaturalLanguagePromptPage }) => ({
    Component: NaturalLanguagePromptPage,
  }));

const sqlGenerationPromptPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotSystemPromptsPage"
  ).then(({ SqlGenerationPromptPage }) => ({
    Component: SqlGenerationPromptPage,
  }));

const metabotSystemPromptsUpsellPage = () =>
  import(
    /* webpackChunkName: "ai-controls" */ "./pages/MetabotSystemPromptsPage"
  ).then(({ MetabotSystemPromptsUpsellPage }) => ({
    Component: MetabotSystemPromptsUpsellPage,
  }));

/**
 * One spelling of each path, used by the routes below and by the prefetch
 * registrations. The registry matches a hovered link against a literal prefix,
 * so a segment renamed in only one of the two places would stop prefetching
 * without failing anything.
 */
const PATHS = {
  featureAccess: "usage-controls/ai-feature-access",
  usageLimits: "usage-controls/ai-usage-limits",
  customization: "customization",
  systemPrompts: "system-prompts",
  chatPrompt: "system-prompts/metabot-chat",
  naturalLanguagePrompt: "system-prompts/natural-language-queries",
  sqlGenerationPrompt: "system-prompts/sql-generation",
} as const;

const adminAiPath = (path: string) => `${Urls.adminAiSettings()}/${path}`;

/**
 * Hovering any AI settings tab starts the fetch, and since they share a chunk,
 * the first hover covers the whole section.
 */
registerPagePrefetch(
  adminAiPath(PATHS.featureAccess),
  metabotFeatureAccessPage,
);
registerPagePrefetch(
  adminAiPath(PATHS.featureAccess),
  metabotFeatureAccessUpsellPage,
);
registerPagePrefetch(adminAiPath(PATHS.usageLimits), metabotUsageLimitsPage);
registerPagePrefetch(
  adminAiPath(PATHS.customization),
  metabotCustomizationPage,
);
registerPagePrefetch(
  adminAiPath(PATHS.customization),
  metabotCustomizationUpsellPage,
);
registerPagePrefetch(adminAiPath(PATHS.systemPrompts), metabotChatPromptPage);

export function getAiControlsRoutes() {
  return (
    <Route element={<RequireMetabotConfigured />}>
      <Route
        key="ai-feature-access"
        path={PATHS.featureAccess}
        lazy={metabotFeatureAccessPage}
      />
      <Route
        key="ai-usage-limits"
        path={PATHS.usageLimits}
        lazy={metabotUsageLimitsPage}
      />
      <Route
        key="customization"
        path={PATHS.customization}
        lazy={metabotCustomizationPage}
      />
      <Route
        key="system-prompts-metabot-chat"
        path={PATHS.chatPrompt}
        lazy={metabotChatPromptPage}
      />
      <Route
        key="system-prompts-natural-language-queries"
        path={PATHS.naturalLanguagePrompt}
        lazy={naturalLanguagePromptPage}
      />
      <Route
        key="system-prompts-sql-generation"
        path={PATHS.sqlGenerationPrompt}
        lazy={sqlGenerationPromptPage}
      />
    </Route>
  );
}

export function getAiControlsUpsellRoutes() {
  return (
    <>
      <Route
        key="ai-feature-access"
        path={PATHS.featureAccess}
        lazy={metabotFeatureAccessUpsellPage}
      />
      <Route
        key="customization"
        path={PATHS.customization}
        lazy={metabotCustomizationUpsellPage}
      />
      <Route
        key="system-prompts"
        path={PATHS.chatPrompt}
        lazy={metabotSystemPromptsUpsellPage}
      />
    </>
  );
}
