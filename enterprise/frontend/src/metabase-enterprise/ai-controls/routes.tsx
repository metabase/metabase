import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import { RequireMetabotConfigured } from "./components/RequireMetabotConfigured";

const metabotFeatureAccessPage = () =>
  import("./pages/MetabotFeatureAccessPage").then(
    ({ MetabotFeatureAccessPage }) => ({ Component: MetabotFeatureAccessPage }),
  );

const metabotFeatureAccessUpsellPage = () =>
  import("./pages/MetabotFeatureAccessPage").then(
    ({ MetabotFeatureAccessUpsellPage }) => ({
      Component: MetabotFeatureAccessUpsellPage,
    }),
  );

const metabotUsageLimitsPage = () =>
  import("./pages/MetabotUsageLimitsPage").then(
    ({ MetabotUsageLimitsPage }) => ({ Component: MetabotUsageLimitsPage }),
  );

const metabotCustomizationPage = () =>
  import("./pages/MetabotCustomizationPage").then(
    ({ MetabotCustomizationPage }) => ({ Component: MetabotCustomizationPage }),
  );

const metabotCustomizationUpsellPage = () =>
  import("./pages/MetabotCustomizationPage").then(
    ({ MetabotCustomizationUpsellPage }) => ({
      Component: MetabotCustomizationUpsellPage,
    }),
  );

const metabotChatPromptPage = () =>
  import("./pages/MetabotSystemPromptsPage").then(
    ({ MetabotChatPromptPage }) => ({ Component: MetabotChatPromptPage }),
  );

const naturalLanguagePromptPage = () =>
  import("./pages/MetabotSystemPromptsPage").then(
    ({ NaturalLanguagePromptPage }) => ({
      Component: NaturalLanguagePromptPage,
    }),
  );

const sqlGenerationPromptPage = () =>
  import("./pages/MetabotSystemPromptsPage").then(
    ({ SqlGenerationPromptPage }) => ({ Component: SqlGenerationPromptPage }),
  );

const metabotSystemPromptsUpsellPage = () =>
  import("./pages/MetabotSystemPromptsPage").then(
    ({ MetabotSystemPromptsUpsellPage }) => ({
      Component: MetabotSystemPromptsUpsellPage,
    }),
  );

/**
 * Hovering an AI settings tab starts the fetch. One prefix per section, since
 * the section a page belongs to is what the sidebar links to.
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
