import type { Store } from "@reduxjs/toolkit";
import { Fragment, createElement } from "react";

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
import {
  Route,
  type RouteComponent,
  redirect,
  withRouteProps,
} from "metabase/router";
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

// Legacy containers that still read v3 router props (`params`/`location`/
// `route`), fed from the router context so they run as `element` routes.
const RoutedRedirectToAllowedSettings = withRouteProps(
  RedirectToAllowedSettings,
);
const RoutedDataModelV1 = withRouteProps(DataModelV1);
const RoutedDatabasePage = withRouteProps(DatabasePage);
const RoutedSegmentListApp = withRouteProps(SegmentListApp);
const RoutedSegmentApp = withRouteProps(SegmentApp);
const RoutedRevisionHistoryApp = withRouteProps(RevisionHistoryApp);
const RoutedGroupDetailApp = withRouteProps(GroupDetailApp);
const RoutedAdminEmbeddingApp = withRouteProps(AdminEmbeddingApp);
const RoutedEmbeddingThemeEditorApp = withRouteProps(EmbeddingThemeEditorApp);
const RoutedOAuthAuthorizationsPage = withRouteProps(OAuthAuthorizationsPage);

export const getRoutes = (
  store: Store<State>,
  CanAccessSettings: RouteComponent,
  IsAdmin: RouteComponent,
) => {
  const state = store.getState();
  const hasSimpleEmbedding = getTokenFeature(state, "embedding_simple");

  return (
    <Route path="/admin" element={<CanAccessSettings />}>
      <Route element={<AdminApp />}>
        <Route index element={<RoutedRedirectToAllowedSettings />} />
        <Route
          path="databases"
          element={createElement(createAdminRouteGuard("databases"))}
        >
          <Route index element={<DatabaseListApp />} />
          <Route element={<IsAdmin />}>
            <Route path="create" element={<RoutedDatabasePage />} />
          </Route>
          <Route path=":databaseId/edit" element={<RoutedDatabasePage />} />
          {PLUGIN_WRITABLE_CONNECTION.getWritableConnectionInfoRoutes(IsAdmin)}
          {PLUGIN_WORKSPACES.getWorkspaceDatabaseRoutes(IsAdmin)}
          <Route path=":databaseId" element={<DatabaseEditApp />}>
            {PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes(IsAdmin)}
          </Route>
        </Route>
        <Route
          path="datamodel"
          element={createElement(createAdminRouteGuard("data-model"))}
        >
          <Route>
            <Route index element={redirect("database")} />
            <Route path="database" element={<RoutedDataModelV1 />} />
            <Route
              path="database/:databaseId"
              element={<RoutedDataModelV1 />}
            />
            <Route
              path="database/:databaseId/schema/:schemaId"
              element={<RoutedDataModelV1 />}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId"
              element={<RoutedDataModelV1 />}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
              element={<RoutedDataModelV1 />}
            />
            <Route element={<RoutedDataModelV1 />}>
              <Route path="segments" element={<RoutedSegmentListApp />} />
              <Route path="segment/create" element={<IsAdmin />}>
                <Route index element={<RoutedSegmentApp />} />
              </Route>
              <Route path="segment/:id" element={<IsAdmin />}>
                <Route index element={<RoutedSegmentApp />} />
              </Route>
              <Route
                path="segment/:id/revisions"
                element={<RoutedRevisionHistoryApp />}
              />
            </Route>
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
              element={redirect(
                "database/:databaseId/schema/:schemaId/table/:tableId",
              )}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
              element={redirect(
                "database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId",
              )}
            />
          </Route>
        </Route>
        {/* PEOPLE */}
        <Route
          path="people"
          element={createElement(createAdminRouteGuard("people"))}
        >
          <Route element={<AdminPeopleApp />}>
            <Route index element={<PeopleListingApp />} />

            {/*NOTE: this must come before the other routes otherwise it will be masked by them*/}
            <Route path="groups">
              <Route index element={<GroupsListingApp />} />
              <Route path=":groupId" element={<RoutedGroupDetailApp />} />
            </Route>

            {/* Tenants */}
            <Route
              path="tenants"
              element={createElement(createTenantsRouteGuard())}
            >
              {PLUGIN_TENANTS.tenantsRoutes ?? (
                <>
                  <Route index element={<UpsellTenants />} />
                  <Route path="groups" element={<UpsellTenants />} />
                  <Route path="people" element={<UpsellTenants />} />
                </>
              )}
            </Route>

            <Route path="" element={<PeopleListingApp />}>
              {modalRoute("new", NewUserModal, { noWrap: true })}
              {PLUGIN_TENANTS.userStrategyRoute}
            </Route>

            <Route path=":userId" element={<PeopleListingApp />}>
              <Route index element={redirect("/admin/people")} />
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
        <Route
          path="embedding"
          element={createElement(createAdminRouteGuard("embedding"))}
        >
          <Route element={<RoutedAdminEmbeddingApp />}>
            <Route index element={<EmbeddingSettings />} />

            <Route path="setup-guide">
              <Route index element={<EmbeddingHubAdminSettingsPage />} />

              <Route
                path="permissions"
                element={<SetupPermissionsAndTenantsPage />}
              />

              <Route path="sso" element={<SetupSsoPage />} />
            </Route>

            {/* EE with non-starter plan has embedding settings on different pages */}
            {hasSimpleEmbedding && (
              <Route path="guest" element={<GuestEmbedsSettings />} />
            )}

            <Route path="security" element={<EmbeddingSecuritySettings />} />
            <Route path="themes" element={<EmbeddingThemeListingApp />} />
            <Route
              path="themes/:themeId"
              element={<RoutedEmbeddingThemeEditorApp />}
            />
          </Route>
        </Route>

        {/* OSS/Starter has all embedding settings on the same page */}
        {!hasSimpleEmbedding && (
          <Route
            path="/admin/embedding/guest"
            element={redirect("/admin/embedding")}
          />
        )}

        {/* Backwards compatibility for embedding settings */}
        <Route
          path="/admin/embedding/modular"
          element={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/embedding/interactive"
          element={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications"
          element={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications/full-app"
          element={redirect("/admin/embedding")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications/standalone"
          element={redirect("/admin/embedding/guest")}
        />
        <Route
          path="/admin/settings/embedding-in-other-applications/sdk"
          element={redirect("/admin/embedding")}
        />

        {/* SETTINGS */}
        <Route
          path="settings"
          element={createElement(createAdminRouteGuard("settings"))}
        >
          {getSettingsRoutes(store, IsAdmin)}
        </Route>
        {/* PERMISSIONS */}
        <Route path="permissions" element={<IsAdmin />}>
          {getAdminPermissionsRoutes()}
        </Route>

        {/* PERFORMANCE */}
        <Route
          path="performance"
          element={createElement(createAdminRouteGuard("performance"))}
        >
          <Route element={<PerformanceApp />}>
            <Route index element={redirect(PerformanceTabId.Databases)} />
            <Route path="databases" element={<StrategyEditorForDatabases />} />
            <Route path="models" element={<ModelPersistenceConfiguration />} />
            <Route
              path="dashboards-and-questions"
              element={
                <PLUGIN_CACHING.StrategyEditorForQuestionsAndDashboards />
              }
            />
          </Route>
        </Route>

        {/* Metabot */}
        <Route
          path="metabot"
          element={createElement(createAdminRouteGuard("metabot"))}
        >
          {PLUGIN_AUDIT.getAiAnalyticsRoutes()}
          {PLUGIN_AUDIT.getMcpAnalyticsRoutes()}
          {PLUGIN_AUDIT.getCliAnalyticsRoutes()}
          <Route key="index-layout" element={<MetabotAdminLayout />}>
            <Route index key="index" element={<AISettingsPage />} />
            <Route key="mcp" path="mcp" element={<McpSettingsPage />} />
          </Route>
          <Route
            key="mcp-authorizations-layout"
            element={
              <MetabotAdminLayout
                fullWidth
                innerContentProps={{ fullWidth: true, fullHeight: true }}
              />
            }
          >
            <Route
              path="mcp/authorizations"
              element={<RoutedOAuthAuthorizationsPage />}
            />
          </Route>
          <Route
            key="layout"
            element={
              <MetabotAdminLayout
                fullWidth={!PLUGIN_AI_CONTROLS.isEnabled}
                innerContentProps={{
                  fullWidth: !PLUGIN_AI_CONTROLS.isEnabled,
                  fullHeight: !PLUGIN_AI_CONTROLS.isEnabled,
                }}
              />
            }
          >
            {PLUGIN_AI_CONTROLS.getAiControlsRoutes()}
          </Route>
        </Route>

        {PLUGIN_SECURITY_CENTER.isEnabled && (
          <Route
            path="security-center"
            element={<PLUGIN_SECURITY_CENTER.SecurityCenterPage />}
          />
        )}

        <Route element={createElement(createAdminRouteGuard("help"))}>
          <Route path="help" element={<Help />}>
            {PLUGIN_SUPPORT.isEnabled &&
              modalRoute("grant-access", PLUGIN_SUPPORT.GrantAccessModal)}
          </Route>
        </Route>
      </Route>
    </Route>
  );
};
