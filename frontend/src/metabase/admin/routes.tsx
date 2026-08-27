import type { Store } from "@reduxjs/toolkit";
import { type ComponentProps, Fragment, createElement } from "react";

import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { UserActivationModal } from "metabase/admin/people/containers/UserActivationModal";
import { UserPasswordResetModal } from "metabase/admin/people/containers/UserPasswordResetModal";
import { UserSuccessModal } from "metabase/admin/people/containers/UserSuccessModal";
import { getRoutes as getAdminPermissionsRoutes } from "metabase/admin/permissions/routes";
import { modalRoute } from "metabase/common/components/ModalRoute";
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

import type { MetabotAdminLayout } from "./ai/MetabotAdminLayout";
import { getSettingsRoutes } from "./settingsRoutes";
import {
  RedirectToAllowedSettings,
  createAdminRouteGuard,
  createTenantsRouteGuard,
} from "./utils";

/**
 * The admin pages, in one chunk. Every loader names it, so the section arrives
 * in a single request rather than one per page.
 *
 * Route guards, the redirects and the modal routes stay eager: they are small,
 * and a guard has to decide before there is anything to show. The pages behind
 * them are fetched the first time one of these routes is matched.
 */
const adminApp = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/app/components/AdminApp"
  ).then(({ AdminApp }) => ({ Component: AdminApp }));

const databaseList = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/databases/containers/DatabaseListApp"
  ).then(({ DatabaseListApp }) => ({ Component: DatabaseListApp }));

const databasePage = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/databases/containers/DatabasePage"
  ).then(({ DatabasePage }) => ({ Component: DatabasePage }));

const databaseEdit = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/databases/containers/DatabaseEditApp"
  ).then(({ DatabaseEditApp }) => ({ Component: DatabaseEditApp }));

const dataModel = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/metadata/pages/DataModelV1"
  ).then(({ DataModelV1 }) => ({
    Component: DataModelV1,
  }));

const segmentList = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/datamodel/containers/SegmentListApp"
  ).then(({ SegmentListApp }) => ({ Component: SegmentListApp }));

const segmentEdit = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/datamodel/containers/SegmentApp"
  ).then(({ SegmentApp }) => ({ Component: SegmentApp }));

const segmentRevisions = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/datamodel/containers/RevisionHistoryApp"
  ).then(({ RevisionHistoryApp }) => ({ Component: RevisionHistoryApp }));

const peopleApp = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/people/containers/AdminPeopleApp"
  ).then(({ AdminPeopleApp }) => ({ Component: AdminPeopleApp }));

const peopleListing = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/people/containers/PeopleListingApp"
  ).then(({ PeopleListingApp }) => ({ Component: PeopleListingApp }));

const groupsListing = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/people/containers/GroupsListingApp"
  ).then(({ GroupsListingApp }) => ({ Component: GroupsListingApp }));

const groupDetail = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/people/containers/GroupDetailApp"
  ).then(({ GroupDetailApp }) => ({ Component: GroupDetailApp }));

const upsellTenants = () =>
  import(/* webpackChunkName: "admin" */ "./upsells/UpsellTenants").then(
    ({ UpsellTenants }) => ({
      Component: UpsellTenants,
    }),
  );

const performanceApp = () =>
  import(
    /* webpackChunkName: "admin" */ "metabase/admin/performance/components/PerformanceApp"
  ).then(({ PerformanceApp }) => ({ Component: PerformanceApp }));

const strategyEditorForDatabases = () =>
  import(
    /* webpackChunkName: "admin" */ "./performance/components/StrategyEditorForDatabases"
  ).then(({ StrategyEditorForDatabases }) => ({
    Component: StrategyEditorForDatabases,
  }));

const modelPersistence = () =>
  import(
    /* webpackChunkName: "admin" */ "./performance/components/ModelPersistenceConfiguration"
  ).then(({ ModelPersistenceConfiguration }) => ({
    Component: ModelPersistenceConfiguration,
  }));

// `route.lazy` supplies a component and no props, so the three routes that
// share this layout bind theirs here.
const metabotLayout =
  (props: ComponentProps<typeof MetabotAdminLayout> = {}) =>
  () =>
    import(/* webpackChunkName: "admin" */ "./ai/MetabotAdminLayout").then(
      ({ MetabotAdminLayout }) => ({
        Component: function MetabotAdminLayoutRoute() {
          return <MetabotAdminLayout {...props} />;
        },
      }),
    );

const aiSettings = () =>
  import(/* webpackChunkName: "admin" */ "./ai/AISettingsPage").then(
    ({ AISettingsPage }) => ({
      Component: AISettingsPage,
    }),
  );

const mcpSettings = () =>
  import(/* webpackChunkName: "admin" */ "./ai/AISettingsPage").then(
    ({ McpSettingsPage }) => ({
      Component: McpSettingsPage,
    }),
  );

const oauthAuthorizations = () =>
  import(/* webpackChunkName: "admin" */ "./ai/OAuthAuthorizationsPage").then(
    ({ OAuthAuthorizationsPage }) => ({ Component: OAuthAuthorizationsPage }),
  );

const help = () =>
  import(/* webpackChunkName: "admin" */ "metabase/admin/help").then(
    ({ Help }) => ({ Component: Help }),
  );

export const getRoutes = (
  store: Store<State>,
  CanAccessSettings: RouteComponent,
  IsAdmin: RouteComponent,
) => {
  return (
    <Route path="/admin" element={<CanAccessSettings />}>
      <Route lazy={adminApp}>
        <Route index element={<RedirectToAllowedSettings />} />
        <Route
          path="databases"
          element={createElement(createAdminRouteGuard("databases"))}
        >
          <Route index lazy={databaseList} />
          <Route element={<IsAdmin />}>
            <Route path="create" lazy={databasePage} />
          </Route>
          <Route path=":databaseId/edit" lazy={databasePage} />
          {PLUGIN_WRITABLE_CONNECTION.getWritableConnectionInfoRoutes(IsAdmin)}
          <Route path=":databaseId" lazy={databaseEdit}>
            {PLUGIN_DB_ROUTING.getDestinationDatabaseRoutes(IsAdmin)}
          </Route>
        </Route>
        <Route
          path="datamodel"
          element={createElement(createAdminRouteGuard("data-model"))}
        >
          <Route>
            <Route index element={redirect("database")} />
            <Route path="database" lazy={dataModel} />
            <Route path="database/:databaseId" lazy={dataModel} />
            <Route
              path="database/:databaseId/schema/:schemaId"
              lazy={dataModel}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId"
              lazy={dataModel}
            />
            <Route
              path="database/:databaseId/schema/:schemaId/table/:tableId/field/:fieldId"
              lazy={dataModel}
            />
            <Route lazy={dataModel}>
              <Route path="segments" lazy={segmentList} />
              <Route path="segment/create" element={<IsAdmin />}>
                <Route index lazy={segmentEdit} />
              </Route>
              <Route path="segment/:id" element={<IsAdmin />}>
                <Route index lazy={segmentEdit} />
              </Route>
              <Route path="segment/:id/revisions" lazy={segmentRevisions} />
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
          <Route lazy={peopleApp}>
            <Route index lazy={peopleListing} />

            {/*NOTE: this must come before the other routes otherwise it will be masked by them*/}
            <Route path="groups">
              <Route index lazy={groupsListing} />
              <Route path=":groupId" lazy={groupDetail} />
            </Route>

            {/* Tenants */}
            <Route
              path="tenants"
              element={createElement(createTenantsRouteGuard())}
            >
              {PLUGIN_TENANTS.tenantsRoutes ?? (
                <>
                  <Route index lazy={upsellTenants} />
                  <Route path="groups" lazy={upsellTenants} />
                  <Route path="people" lazy={upsellTenants} />
                </>
              )}
            </Route>

            <Route path="" lazy={peopleListing}>
              {modalRoute("new", NewUserModal, { noWrap: true })}
              {PLUGIN_TENANTS.userStrategyRoute}
            </Route>

            <Route path=":userId" lazy={peopleListing}>
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

        {/* EMBEDDING — the admin embedding section moved to the embedding
            hub at /embedding (EMB-1526). Every old path redirects to its hub
            equivalent so no bookmarked/linked URL breaks. */}
        <Route
          path="/admin/embedding"
          element={redirect("/embedding/security")}
        />
        <Route
          path="/admin/embedding/setup-guide"
          element={redirect("/embedding")}
        />
        <Route
          path="/admin/embedding/setup-guide/permissions"
          element={redirect("/embedding/get-started/permissions-setup")}
        />
        <Route
          path="/admin/embedding/setup-guide/sso"
          element={redirect("/embedding/get-started/sso-setup")}
        />
        <Route
          path="/admin/embedding/guest"
          element={redirect("/embedding/security")}
        />
        <Route
          path="/admin/embedding/security"
          element={redirect("/embedding/security")}
        />
        <Route
          path="/admin/embedding/themes"
          element={redirect("/embedding/appearance")}
        />
        <Route
          path="/admin/embedding/themes/:themeId"
          element={redirect("/embedding/appearance/theme/:themeId")}
        />

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
          <Route lazy={performanceApp}>
            <Route index element={redirect(PerformanceTabId.Databases)} />
            <Route path="databases" lazy={strategyEditorForDatabases} />
            <Route path="models" lazy={modelPersistence} />
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
          <Route key="index-layout" lazy={metabotLayout()}>
            <Route index key="index" lazy={aiSettings} />
            <Route key="mcp" path="mcp" lazy={mcpSettings} />
          </Route>
          <Route
            key="mcp-authorizations-layout"
            lazy={metabotLayout({
              fullWidth: true,
              innerContentProps: { fullWidth: true, fullHeight: true },
            })}
          >
            <Route path="mcp/authorizations" lazy={oauthAuthorizations} />
          </Route>
          <Route
            key="layout"
            lazy={metabotLayout({
              fullWidth: !PLUGIN_AI_CONTROLS.isEnabled,
              innerContentProps: {
                fullWidth: !PLUGIN_AI_CONTROLS.isEnabled,
                fullHeight: !PLUGIN_AI_CONTROLS.isEnabled,
              },
            })}
          >
            {PLUGIN_AI_CONTROLS.getAiControlsRoutes()}
          </Route>
        </Route>

        {PLUGIN_SECURITY_CENTER.isEnabled && (
          <Route
            path="security-center"
            lazy={PLUGIN_SECURITY_CENTER.securityCenterPage}
          />
        )}

        <Route element={createElement(createAdminRouteGuard("help"))}>
          <Route path="help" lazy={help}>
            {PLUGIN_SUPPORT.isEnabled &&
              modalRoute("grant-access", PLUGIN_SUPPORT.GrantAccessModal)}
          </Route>
        </Route>
      </Route>
    </Route>
  );
};
