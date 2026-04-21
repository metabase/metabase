import { Route } from "react-router";

import { MetabotCustomizationPage } from "./pages/MetabotCustomizationPage";
import { MetabotFeatureAccessPage } from "./pages/MetabotFeatureAccessPage";
import {
  MetabotChatPromptPage,
  NaturalLanguagePromptPage,
  SqlGenerationPromptPage,
} from "./pages/MetabotSystemPromptsPage";
import { MetabotUsageLimitsPage } from "./pages/MetabotUsageLimitsPage";

export function getAiControlsRoutes() {
  return (
    <>
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
    </>
  );
}
