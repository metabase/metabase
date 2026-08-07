import type { Store } from "@reduxjs/toolkit";
import { Fragment, createElement } from "react";

import AdminApp from "metabase/admin/app/components/AdminApp";
import { DatabaseEditApp } from "metabase/admin/databases/containers/DatabaseEditApp";
import { DatabaseListApp } from "metabase/admin/databases/containers/DatabaseListApp";
import { DatabasePage } from "metabase/admin/databases/containers/DatabasePage";
import { RevisionHistoryApp } from "metabase/admin/datamodel/containers/RevisionHistoryApp";
import { SegmentApp } from "metabase/admin/datamodel/containers/SegmentApp";
import { SegmentListApp } from "metabase/admin/datamodel/containers/SegmentListApp";
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
import { PermissionsBasePath } from "metabase/admin/permissions/components/PermissionsBasePath";
import { getRoutes as getAdminPermissionsRoutes } from "metabase/admin/permissions/routes";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { DataModelV1 } from "metabase/metadata/pages/DataModelV1";
import {
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_AI_CONTROLS,
  PLUGIN_CACHING,
  PLUGIN_DB_ROUTING,
  PLUGIN_SECURITY_CENTER,
  PLUGIN_SUPPORT,
  PLUGIN_TENANTS,
  PLUGIN_WRITABLE_CONNECTION,
  PerformanceTabId,
} from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { Route, type RouteComponent, redirect } from "metabase/router";
import * as Urls from "metabase/urls";

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
  return (
    <Route path="/admin" element={<CanAccessSettings />}>
      <Route element={<AdminApp />}>
        <Route index element={<RedirectToAllowedSettings />} />
        <Route
          path="databases"
          element={createElement(createAdminRouteGuard("databases"))}
        >
          <Route index element={<DatabaseListApp />} />
          <Route element={<IsAdmin />}>
            <Route path="create" element={<DatabasePage />} />
          </Route>
          <Route path=":databaseId/edit" element={<DatabasePage />} />
          {PLUGIN_WRITABLE_CONNECTION.getWritableConnectionInfoRoutes(IsAdmin)}
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
            <Route path="database" element={<DataModelV1 />} />
            <Route path="database/:databaseId" element={<DataModelV1 />} />
            <Route
              path="database/:databaseId/schema/:schemaId"
              element={<DataModelV1 />}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId"
              element={<DataModelV1 />}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
              element={<DataModelV1 />}
            />
            <Route element={<DataModelV1 />}>
              <Route path="segments" element={<SegmentListApp />} />
              <Route path="segment/create" element={<IsAdmin />}>
                <Route index element={<SegmentApp />} />
              </Route>
              <Route path="segment/:id" element={<IsAdmin />}>
                <Route index element={<SegmentApp />} />
              </Route>
              <Route
                path="segment/:id/revisions"
                element={<RevisionHistoryApp />}
              />
            </Route>
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/settings"
              element={redirect(
                "../database/:databaseId/schema/:schemaId/table/:tableId",
              )}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId/:section"
              element={redirect(
                "../database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId",
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
              <Route path=":groupId" element={<GroupDetailApp />} />
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

        {/* EMBEDDING moved to the /embedding hub. Every old path still
            resolves: redirect() renders <Navigate replace>, so a redirect whose
            target is itself a redirect simply re-matches and fires again, and
            `replace` keeps history at one entry however deep the chain runs. */}
        <Route
          path="/admin/embedding"
          element={redirect(Urls.embeddingHubSecurity())}
        />
        <Route
          path="/admin/embedding/setup-guide"
          element={redirect(Urls.embeddingHub())}
        />
        <Route
          path="/admin/embedding/setup-guide/permissions"
          element={redirect(`${Urls.embeddingHub()}/permissions-setup`)}
        />
        <Route
          path="/admin/embedding/setup-guide/sso"
          element={redirect(`${Urls.embeddingHub()}/sso-setup`)}
        />
        <Route
          path="/admin/embedding/guest"
          element={redirect(Urls.embeddingHubSecurity())}
        />
        <Route
          path="/admin/embedding/security"
          element={redirect(Urls.embeddingHubSecurity())}
        />
        <Route
          path="/admin/embedding/themes"
          element={redirect(Urls.embeddingHubAppearance())}
        />
        <Route
          path="/admin/embedding/themes/:themeId"
          element={redirect(`${Urls.embeddingHubAppearance()}/:themeId`)}
        />

        {/* Backwards compatibility for embedding settings. These chain through
            the layer above rather than pointing at their final destination. */}
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
          <Route element={<PermissionsBasePath />}>
            {getAdminPermissionsRoutes()}
          </Route>
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
              element={<OAuthAuthorizationsPage />}
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
