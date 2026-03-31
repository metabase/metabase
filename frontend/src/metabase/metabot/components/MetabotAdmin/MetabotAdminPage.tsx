import { IndexRoute, Route } from "react-router";

import { MetabotAdminLayout } from "./MetabotAdminLayout";
import { MetabotConfig } from "./MetabotConfig";
import { MetabotCustomizationPage } from "./MetabotCustomizationPage";
import { MetabotFeatureAccessPage } from "./MetabotFeatureAccessPage";
import { MetabotSetup } from "./MetabotSetup";
import {
  MetabotChatPromptPage,
  NaturalLanguagePromptPage,
  SqlGenerationPromptPage,
} from "./MetabotSystemPromptsPage";
import { MetabotUsageLimitsPage } from "./MetabotUsageLimitsPage";

export function getAdminRoutes() {
  return [
    <Route key="layout" component={MetabotAdminLayout}>
      <IndexRoute key="index" component={MetabotConfig} />
      <Route key="setup" path="setup" component={MetabotSetup} />
      <Route key="metabot" path=":metabotId" component={MetabotConfig} />
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
    </Route>,
  ];
}
