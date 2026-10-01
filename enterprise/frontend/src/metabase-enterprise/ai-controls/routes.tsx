import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { RequireMetabotConfigured } from "./components/RequireMetabotConfigured";

/**
 * The AI settings pages, each in its own chunk.
 *
 * The nine loaders below resolve to four page modules, and those four share
 * under a tenth of their weight, so one chunk for the section would make a
 * visit to any single tab pay for all of them.
 *
 * `RequireMetabotConfigured` is not split. It redirects away when Metabot is
 * unconfigured, so splitting it would put a fetch in front of a redirect that
 * renders nothing.
 */
const metabotFeatureAccessPage = () =>
  import(
    /* webpackChunkName: "metabot-feature-access" */ "./pages/MetabotFeatureAccessPage"
  ).then(({ MetabotFeatureAccessPage }) => ({
    Component: MetabotFeatureAccessPage,
  }));

const metabotFeatureAccessUpsellPage = () =>
  import(
    /* webpackChunkName: "metabot-feature-access" */ "./pages/MetabotFeatureAccessPage"
  ).then(({ MetabotFeatureAccessUpsellPage }) => ({
    Component: MetabotFeatureAccessUpsellPage,
  }));

const metabotUsageLimitsPage = () =>
  import(
    /* webpackChunkName: "metabot-usage-limits" */ "./pages/MetabotUsageLimitsPage"
  ).then(({ MetabotUsageLimitsPage }) => ({
    Component: MetabotUsageLimitsPage,
  }));

const metabotCustomizationPage = () =>
  import(
    /* webpackChunkName: "metabot-customization" */ "./pages/MetabotCustomizationPage"
  ).then(({ MetabotCustomizationPage }) => ({
    Component: MetabotCustomizationPage,
  }));

const metabotCustomizationUpsellPage = () =>
  import(
    /* webpackChunkName: "metabot-customization" */ "./pages/MetabotCustomizationPage"
  ).then(({ MetabotCustomizationUpsellPage }) => ({
    Component: MetabotCustomizationUpsellPage,
  }));

const metabotChatPromptPage = () =>
  import(
    /* webpackChunkName: "metabot-system-prompts" */ "./pages/MetabotSystemPromptsPage"
  ).then(({ MetabotChatPromptPage }) => ({ Component: MetabotChatPromptPage }));

const naturalLanguagePromptPage = () =>
  import(
    /* webpackChunkName: "metabot-system-prompts" */ "./pages/MetabotSystemPromptsPage"
  ).then(({ NaturalLanguagePromptPage }) => ({
    Component: NaturalLanguagePromptPage,
  }));

const sqlGenerationPromptPage = () =>
  import(
    /* webpackChunkName: "metabot-system-prompts" */ "./pages/MetabotSystemPromptsPage"
  ).then(({ SqlGenerationPromptPage }) => ({
    Component: SqlGenerationPromptPage,
  }));

const metabotSystemPromptsUpsellPage = () =>
  import(
    /* webpackChunkName: "metabot-system-prompts" */ "./pages/MetabotSystemPromptsPage"
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
 * Hovering an AI settings tab starts its fetch, so the chunk is usually in hand
 * by the time the click lands.
 *
 * The pages that differ only by license come from one module, so a registration
 * covers both. The three system prompt tabs are one module too, which is why the
 * prefix they share is registered once.
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
