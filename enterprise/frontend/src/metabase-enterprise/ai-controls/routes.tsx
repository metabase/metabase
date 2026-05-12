import { Route } from "react-router";

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
    <Route component={RequireMetabotConfigured}>
      <Route
        key="ai-feature-access"
        path=":metabotId/usage-controls/ai-feature-access"
        component={MetabotFeatureAccessPage}
      />
      <Route
        key="ai-usage-limits"
        path=":metabotId/usage-controls/ai-usage-limits"
        component={MetabotUsageLimitsPage}
      />
      <Route
        key="customization"
        path=":metabotId/customization"
        component={MetabotCustomizationPage}
      />
      <Route
        key="system-prompts-metabot-chat"
        path=":metabotId/system-prompts/metabot-chat"
        component={MetabotChatPromptPage}
      />
      <Route
        key="system-prompts-natural-language-queries"
        path=":metabotId/system-prompts/natural-language-queries"
        component={NaturalLanguagePromptPage}
      />
      <Route
        key="system-prompts-sql-generation"
        path=":metabotId/system-prompts/sql-generation"
        component={SqlGenerationPromptPage}
      />
    </Route>
  );
}

export function getAiControlsUpsellRoutes() {
  return (
    <>
      <Route
        key="ai-feature-access"
        path=":metabotId/usage-controls/ai-feature-access"
        component={MetabotFeatureAccessUpsellPage}
      />
      <Route
        key="customization"
        path=":metabotId/customization"
        component={MetabotCustomizationUpsellPage}
      />
      <Route
        key="system-prompts"
        path=":metabotId/system-prompts/metabot-chat"
        component={MetabotSystemPromptsUpsellPage}
      />
    </>
  );
}
