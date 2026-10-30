import { ADMIN_PERMISSIONS_BASE_PATH } from "metabase/common/components/PermissionsBasePath/base-path";
import { Route, registerPagePrefetch } from "metabase/router";
import * as Urls from "metabase/urls";

import {
  RequireMcpEnabled,
  RequireMetabotConfigured,
} from "./components/RequireMetabotConfigured";

/**
 * The AI settings pages, each in its own chunk.
 *
 * The ten loaders below resolve to five page modules, and those five share
 * under a tenth of their weight, so one chunk for the section would make a
 * visit to any single tab pay for all of them.
 *
 * The gates are not split. They redirect away when their feature is off, so
 * splitting them would put a fetch in front of a redirect that renders nothing.
 */
const aiFeatureAccessPage = () =>
  import(
    /* webpackChunkName: "ai-feature-access" */ "./pages/AiFeatureAccessPage"
  ).then(({ AiFeatureAccessPage }) => ({ Component: AiFeatureAccessPage }));

const aiFeatureAccessUpsellPage = () =>
  import(
    /* webpackChunkName: "ai-feature-access" */ "./pages/AiFeatureAccessPage"
  ).then(({ AiFeatureAccessUpsellPage }) => ({
    Component: AiFeatureAccessUpsellPage,
  }));

const mcpToolsAccessPage = () =>
  import(
    /* webpackChunkName: "mcp-tools-access" */ "./pages/McpToolsAccessPage"
  ).then(({ McpToolsAccessPage }) => ({ Component: McpToolsAccessPage }));

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
 *
 * `featureAccess` and `mcpToolAccess` live under `/admin/permissions`; the rest
 * live under `/admin/metabot`.
 */
const PATHS = {
  featureAccess: "ai-feature-access",
  mcpToolAccess: "mcp-tool-access",
  usageLimits: "ai-usage-limits",
  customization: "customization",
  systemPrompts: "system-prompts",
  chatPrompt: "system-prompts/metabot-chat",
  naturalLanguagePrompt: "system-prompts/natural-language-queries",
  sqlGenerationPrompt: "system-prompts/sql-generation",
} as const;

const adminAiPath = (path: string) => `${Urls.adminAiSettings()}/${path}`;
const adminPermissionsPath = (path: string) =>
  `${ADMIN_PERMISSIONS_BASE_PATH}/${path}`;

/**
 * Hovering an AI settings tab starts its fetch, so the chunk is usually in hand
 * by the time the click lands.
 *
 * Called from the licensed branch of `initializePlugin`, so only the pages this
 * instance mounts are registered. A registration is also what the background pass
 * reads, and fetching a page nobody can reach would spend a download on nothing.
 *
 * The three system prompt tabs are one module, which is why the prefix they share
 * is registered once.
 */
export function registerAiControlsPagePrefetch(): void {
  registerPagePrefetch(
    adminPermissionsPath(PATHS.featureAccess),
    aiFeatureAccessPage,
  );
  registerPagePrefetch(
    adminPermissionsPath(PATHS.mcpToolAccess),
    mcpToolsAccessPage,
  );
  registerPagePrefetch(adminAiPath(PATHS.usageLimits), metabotUsageLimitsPage);
  registerPagePrefetch(
    adminAiPath(PATHS.customization),
    metabotCustomizationPage,
  );
  registerPagePrefetch(adminAiPath(PATHS.systemPrompts), metabotChatPromptPage);
}

/**
 * The pages an instance without the license mounts. Usage limits and AI feature
 * access share one upsell page.
 */
export function registerAiControlsUpsellPagePrefetch(): void {
  registerPagePrefetch(
    adminPermissionsPath(PATHS.featureAccess),
    aiFeatureAccessUpsellPage,
  );
  registerPagePrefetch(
    adminAiPath(PATHS.usageLimits),
    aiFeatureAccessUpsellPage,
  );
  registerPagePrefetch(
    adminAiPath(PATHS.customization),
    metabotCustomizationUpsellPage,
  );
  registerPagePrefetch(
    adminAiPath(PATHS.systemPrompts),
    metabotSystemPromptsUpsellPage,
  );
}

export function getAiControlsRoutes() {
  return (
    <Route element={<RequireMetabotConfigured />}>
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

export function getAiControlsPermissionsRoutes() {
  return (
    <>
      <Route element={<RequireMetabotConfigured />}>
        <Route
          key="ai-feature-access"
          path={PATHS.featureAccess}
          lazy={aiFeatureAccessPage}
        />
      </Route>
      <Route element={<RequireMcpEnabled />}>
        <Route
          key="mcp-tool-access"
          path={PATHS.mcpToolAccess}
          lazy={mcpToolsAccessPage}
        />
      </Route>
    </>
  );
}

export function getAiControlsUpsellRoutes() {
  return (
    <>
      <Route
        key="ai-usage-limits"
        path={PATHS.usageLimits}
        lazy={aiFeatureAccessUpsellPage}
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

export function getAiControlsPermissionsUpsellRoutes() {
  return (
    <Route
      key="ai-feature-access"
      path={PATHS.featureAccess}
      lazy={aiFeatureAccessUpsellPage}
    />
  );
}
