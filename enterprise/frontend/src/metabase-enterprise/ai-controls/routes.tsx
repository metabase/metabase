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
 * Hovering any AI settings tab starts the fetch, and since they share a chunk,
 * the first hover covers the whole section.
 */
registerPagePrefetch(
  `${Urls.adminAiSettings()}/usage-controls/ai-feature-access`,
  metabotFeatureAccessPage,
);
registerPagePrefetch(
  `${Urls.adminAiSettings()}/usage-controls/ai-feature-access`,
  metabotFeatureAccessUpsellPage,
);
registerPagePrefetch(
  `${Urls.adminAiSettings()}/usage-controls/ai-usage-limits`,
  metabotUsageLimitsPage,
);
registerPagePrefetch(
  `${Urls.adminAiSettings()}/customization`,
  metabotCustomizationPage,
);
registerPagePrefetch(
  `${Urls.adminAiSettings()}/customization`,
  metabotCustomizationUpsellPage,
);
registerPagePrefetch(
  `${Urls.adminAiSettings()}/system-prompts`,
  metabotChatPromptPage,
);

export function getAiControlsRoutes() {
  return (
    <Route element={<RequireMetabotConfigured />}>
      <Route
        key="ai-feature-access"
        path="usage-controls/ai-feature-access"
        lazy={metabotFeatureAccessPage}
      />
      <Route
        key="ai-usage-limits"
        path="usage-controls/ai-usage-limits"
        lazy={metabotUsageLimitsPage}
      />
      <Route
        key="customization"
        path="customization"
        lazy={metabotCustomizationPage}
      />
      <Route
        key="system-prompts-metabot-chat"
        path="system-prompts/metabot-chat"
        lazy={metabotChatPromptPage}
      />
      <Route
        key="system-prompts-natural-language-queries"
        path="system-prompts/natural-language-queries"
        lazy={naturalLanguagePromptPage}
      />
      <Route
        key="system-prompts-sql-generation"
        path="system-prompts/sql-generation"
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
        path="usage-controls/ai-feature-access"
        lazy={metabotFeatureAccessUpsellPage}
      />
      <Route
        key="customization"
        path="customization"
        lazy={metabotCustomizationUpsellPage}
      />
      <Route
        key="system-prompts"
        path="system-prompts/metabot-chat"
        lazy={metabotSystemPromptsUpsellPage}
      />
    </>
  );
}
