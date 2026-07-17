import type { Store } from "@reduxjs/toolkit";
import { Fragment } from "react";

import AdminApp from "metabase/admin/app/components/AdminApp";
import { DatabaseEditApp } from "metabase/admin/databases/containers/DatabaseEditApp";
import { DatabaseListApp } from "metabase/admin/databases/containers/DatabaseListApp";
import { DatabasePage } from "metabase/admin/databases/containers/DatabasePage";
import { RevisionHistoryApp } from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import { SegmentApp } from "metabase/admin/datamodel/containers/SegmentApp";
import { SegmentListApp } from "metabase/admin/datamodel/containers/SegmentListApp";
import { EmbeddingThemeEditorApp } from "metabase/admin/embedding/components/ThemeEditor";
import { EmbeddingThemeListingApp } from "metabase/admin/embedding/components/ThemeListing";
import { AdminEmbeddingApp } from "metabase/admin/embedding/containers/AdminEmbeddingApp";
import { EmbeddingHubAdminSettingsPage } from "metabase/admin/embedding/embedding-hub";
import { Help } from "metabase/admin/help";
import { AdminPeopleApp } from "metabase/admin/people/containers/AdminPeopleApp";
import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { GroupDetailApp } from "metabase/admin/people/containers/GroupDetailApp";
import { GroupsListingApp } from "metabase/admin/people/containers/GroupsListingApp";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { PeopleListingApp } from "metabase/admin/people/containers/PeopleListingApp";
import { UserActivationModal } from "metabase/admin/people/containers/UserActivationModal";
import { UserPasswordResetModal } from "metabase/admin/people/containers/UserPasswordResetModal";
import { UserSuccessModal } from "metabase/admin/people/containers/UserSuccessModal";
import { PerformanceApp } from "metabase/admin/performance/components/PerformanceApp";
import { getRoutes as getAdminPermissionsRoutes } from "metabase/admin/permissions/routes";
import {
  EmbeddingSecuritySettings,
  EmbeddingSettings,
  GuestEmbedsSettings,
} from "metabase/admin/settings/components/EmbeddingSettings";
import { modalRoute } from "metabase/common/components/ModalRoute";
import {
  SetupPermissionsAndTenantsPage,
  SetupSsoPage,
} from "metabase/embedding/embedding-hub";
import { DataModelV1 } from "metabase/metadata/pages/DataModelV1";
import {
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_AI_CONTROLS,
  PLUGIN_AUDIT,
  PLUGIN_CACHING,
  PLUGIN_DB_ROUTING,
  PLUGIN_SECURITY_CENTER,
  PLUGIN_SUPPORT,
  PLUGIN_TENANTS,
  PLUGIN_WORKSPACES,
  PLUGIN_WRITABLE_CONNECTION,
  PerformanceTabId,
} from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { Route, type RouteComponent, redirect } from "metabase/router";
import { getTokenFeature } from "metabase/selectors/settings";

import { AISettingsPage, McpSettingsPage } from "./ai/AISettingsPage";
import { MetabotAdminLayout } from "./ai/MetabotAdminLayout";
import { OAuthAuthorizationsPage } from "./ai/OAuthAuthorizationsPage";
import { ModelPersistenceConfiguration } from "./performance/components/ModelPersistenceConfiguration";
import { StrategyEditorForDatabases } from "./performance/components/StrategyEditorForDatabases";
import { getSettingsRoutes } from "./settingsRoutes";
import { UpsellTenants } from "./upsells/UpsellTenants";
import {
  RedirectToAllowedSettings,
  createAdminRouteGuard,
  createTenantsRouteGuard,
} from "./utils";

export const getRoutes = (
  store: Store<State>,
  CanAccessSettings: RouteComponent,
  IsAdmin: RouteComponent,
) => {
  const state = store.getState();
  const hasSimpleEmbedding = getTokenFeature(state, "embedding_simple");

  return (
    <Route path="/admin" element={<CanAccessSettings />}>
      <Route component={AdminApp}>
        <Route index component={RedirectToAllowedSettings} />
        <Route path="databases" component={createAdminRouteGuard("databases")}>
          <Route index component={DatabaseListApp} />
          <Route element={<IsAdmin />}>
            <Route path="create" component={DatabasePage} />
          </Route>
          <Route path=":databaseId/edit" component={DatabasePage} />
          {PLUGIN_WRITABLE_CONNECTION.getWritableConnectionInfoRoutes(IsAdmin)}
          {PLUGIN_WORKSPACES.getWorkspaceDatabaseRoutes(IsAdmin)}
          <Route path=":databaseId" component={DatabaseEditApp}>
            {PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes(IsAdmin)}
          </Route>
        </Route>
        <Route path="datamodel" component={createAdminRouteGuard("data-model")}>
          <Route>
            <Route index component={redirect("database")} />
            <Route path="database" component={DataModelV1} />
            <Route path="database/:databaseId" component={DataModelV1} />
            <Route
              path="database/:databaseId/schema/:schemaId"
              component={DataModelV1}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId"
              component={DataModelV1}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
              component={DataModelV1}
            />
            <Route component={DataModelV1}>
              <Route path="segments" component={SegmentListApp} />
              <Route path="segment/create" element={<IsAdmin />}>
                <Route index component={SegmentApp} />
              </Route>
              <Route path="segment/:id" element={<IsAdmin />}>
                <Route index component={SegmentApp} />
              </Route>
              <Route
                path="segment/:id/revisions"
                component={RevisionHistoryApp}
              />
            </Route>
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
              component={redirect(
                "database/:databaseId/schema/:schemaId/table/:tableId",
              )}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
              component={redirect(
                "database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId",
              )}
            />
          </Route>
        </Route>
        {/* PEOPLE */}
        <Route path="people" component={createAdminRouteGuard("people")}>
          <Route component={AdminPeopleApp}>
            <Route index component={PeopleListingApp} />

            {/*NOTE: this must come before the other routes otherwise it will be masked by them*/}
            <Route path="groups">
              <Route index component={GroupsListingApp} />
              <Route path=":groupId" component={GroupDetailApp} />
            </Route>

            {/* Tenants */}
            <Route path="tenants" component={createTenantsRouteGuard()}>
              {PLUGIN_TENANTS.tenantsRoutes ?? (
                <>
                  <Route index component={UpsellTenants} />
                  <Route path="groups" component={UpsellTenants} />
                  <Route path="people" component={UpsellTenants} />
                </>
              )}
            </Route>

            <Route path="" component={PeopleListingApp}>
              {modalRoute("new", NewUserModal, { noWrap: true })}
              {PLUGIN_TENANTS.userStrategyRoute}
            </Route>

            <Route path=":userId" component={PeopleListingApp}>
              <Route index component={redirect("/admin/people")} />
              {modalRoute("edit", EditUserModal, { noWrap: true })}
              {modalRoute("success", UserSuccessModal, { noWrap: true })}
              {modalRoute("reset", UserPasswordResetModal, { noWrap: true })}
              {modalRoute("deactivate", UserActivationModal, { noWrap: true })}
              {modalRoute("reactivate", UserActivationModal, { noWrap: true })}
              {PLUGIN_ADMIN_USER_MENU_ROUTES.map((getRoutes, index) => (
                <Fragment key={index}>{getRoutes()}</Fragment>
              ))}
            </Route>
          </Route>
        </Route>

        {/* EMBEDDING */}
        <Route path="embedding" component={createAdminRouteGuard("embedding")}>
          <Route component={AdminEmbeddingApp}>
            <Route index component={EmbeddingSettings} />

            <Route path="setup-guide">
              <Route index component={EmbeddingHubAdminSettingsPage} />

              <Route
                path="permissions"
                component={SetupPermissionsAndTenantsPage}
              />

              <Route path="sso" component={SetupSsoPage} />
            </Route>

            {/* EE with non-starter plan has embedding settings on different pages */}
            {hasSimpleEmbedding && (
              <Route path="guest" component={GuestEmbedsSettings} />
            )}

            <Route path="security" component={EmbeddingSecuritySettings} />
            <Route path="themes" component={EmbeddingThemeListingApp} />
            <Route path="themes/:themeId" component={EmbeddingThemeEditorApp} />
          </Route>
        </Route>

        {/* OSS/Starter has all embedding settings on the same page */}
        {!hasSimpleEmbedding && (
          <Route
            path="/admin/embedding/guest"
            component={redirect("/admin/embedding")}
          />
        )}

        {/* Backwards compatibility for embedding settings */}
        <Route
          path="/admin/embedding/modular"
          component={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/embedding/interactive"
          component={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications"
          component={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications/full-app"
          component={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications/standalone"
          component={redirect("/admin/embedding/guest")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications/sdk"
          component={redirect("/admin/embedding")}
        />

        {/* SETTINGS */}
        <Route path="settings" component={createAdminRouteGuard("settings")}>
          {getSettingsRoutes(store, IsAdmin)}
        </Route>
        {/* PERMISSIONS */}
        <Route path="permissions" element={<IsAdmin />}>
          {getAdminPermissionsRoutes()}
        </Route>

        {/* PERFORMANCE */}
        <Route
          path="performance"
          component={createAdminRouteGuard("performance")}
        >
          <Route component={PerformanceApp}>
            <Route index component={redirect(PerformanceTabId.Databases)} />
            <Route path="databases" component={StrategyEditorForDatabases} />
            <Route path="models" component={ModelPersistenceConfiguration} />
            <Route
              path="dashboards-and-questions"
              component={PLUGIN_CACHING.StrategyEditorForQuestionsAndDashboards}
            />
          </Route>
        </Route>

        {/* Metabot */}
        <Route path="metabot" component={createAdminRouteGuard("metabot")}>
          {PLUGIN_AUDIT.getAiAnalyticsRoutes()}
          {PLUGIN_AUDIT.getMcpAnalyticsRoutes()}
          <Route key="index-layout" component={MetabotAdminLayout}>
            <Route index key="index" component={AISettingsPage} />
            <Route key="mcp" path="mcp" component={McpSettingsPage} />
          </Route>
          <Route
            key="mcp-authorizations-layout"
            component={(props) => (
              <MetabotAdminLayout
                {...props}
                fullWidth
                innerContentProps={{ fullWidth: true, fullHeight: true }}
              />
            )}
          >
            <Route
              path="mcp/authorizations"
              component={OAuthAuthorizationsPage}
            />
          </Route>
          <Route
            key="layout"
            component={(props) => (
              <MetabotAdminLayout
                {...props}
                fullWidth={!PLUGIN_AI_CONTROLS.isEnabled}
                innerContentProps={{
                  fullWidth: !PLUGIN_AI_CONTROLS.isEnabled,
                  fullHeight: !PLUGIN_AI_CONTROLS.isEnabled,
                }}
              />
            )}
          >
            {PLUGIN_AI_CONTROLS.getAiControlsRoutes()}
          </Route>
        </Route>

        {PLUGIN_SECURITY_CENTER.isEnabled && (
          <Route
            path="security-center"
            component={PLUGIN_SECURITY_CENTER.SecurityCenterPage}
          />
        )}

        <Route component={createAdminRouteGuard("help")}>
          <Route path="help" component={Help}>
            {PLUGIN_SUPPORT.isEnabled &&
              modalRoute("grant-access", PLUGIN_SUPPORT.GrantAccessModal)}
          </Route>
        </Route>
      </Route>
    </Route>
  );
};
