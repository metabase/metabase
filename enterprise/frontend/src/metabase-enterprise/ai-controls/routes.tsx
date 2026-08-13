import { Route } from "metabase/router";

import { RequireMetabotConfigured } from "./components/RequireMetabotConfigured";
import {
  MetabotCustomizationPage,
  MetabotCustomizationUpsellPage,
} from "./pages/MetabotCustomizationPage";
import {
  MetabotFeatureAccessPage,
  MetabotFeatureAccessUpsellPage,
} from "./pages/MetabotFeatureAccessPage";
import {
  MetabotChatPromptPage,
  MetabotSystemPromptsUpsellPage,
  NaturalLanguagePromptPage,
  SqlGenerationPromptPage,
} from "./pages/MetabotSystemPromptsPage";
import { MetabotUsageLimitsPage } from "./pages/MetabotUsageLimitsPage";

export function getAiControlsRoutes() {
  return (
    <Route element={<RequireMetabotConfigured />}>
      <Route
        key="ai-feature-access"
        path="usage-controls/ai-feature-access"
        element={<MetabotFeatureAccessPage />}
      />
      <Route
        key="ai-usage-limits"
        path="usage-controls/ai-usage-limits"
        element={<MetabotUsageLimitsPage />}
      />
      <Route
        key="customization"
        path="customization"
        element={<MetabotCustomizationPage />}
      />
      <Route
        key="system-prompts-metabot-chat"
        path="system-prompts/metabot-chat"
        element={<MetabotChatPromptPage />}
      />
      <Route
        key="system-prompts-natural-language-queries"
        path="system-prompts/natural-language-queries"
        element={<NaturalLanguagePromptPage />}
      />
      <Route
        key="system-prompts-sql-generation"
        path="system-prompts/sql-generation"
        element={<SqlGenerationPromptPage />}
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
        element={<MetabotFeatureAccessUpsellPage />}
      />
      <Route
        key="customization"
        path="customization"
        element={<MetabotCustomizationUpsellPage />}
      />
      <Route
        key="system-prompts"
        path="system-prompts/metabot-chat"
        element={<MetabotSystemPromptsUpsellPage />}
      />
    </>
  );
}
