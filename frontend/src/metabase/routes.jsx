import { IndexRedirect, IndexRoute, Redirect } from "react-router";
import { t } from "ttag";

import App from "metabase/App.tsx";
import getAccountRoutes from "metabase/account/routes";
import CollectionPermissionsModal from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import getAdminRoutes from "metabase/admin/routes";
import { ForgotPassword } from "metabase/auth/components/ForgotPassword";
import { Login } from "metabase/auth/components/Login";
import { Logout } from "metabase/auth/components/Logout";
import { ResetPassword } from "metabase/auth/components/ResetPassword";
import CollectionLanding from "metabase/collections/components/CollectionLanding";
import { MoveCollectionModal } from "metabase/collections/components/MoveCollectionModal";
import { TrashCollectionLanding } from "metabase/collections/components/TrashCollectionLanding";
import ArchiveCollectionModal from "metabase/components/ArchiveCollectionModal";
import { Unauthorized } from "metabase/components/ErrorPages";
import NotFoundFallbackPage from "metabase/containers/NotFoundFallbackPage";
import { UnsubscribePage } from "metabase/containers/Unsubscribe";
import { UserCollectionList } from "metabase/containers/UserCollectionList";
import { DashboardCopyModalConnected } from "metabase/dashboard/components/DashboardCopyModal";
import { DashboardMoveModalConnected } from "metabase/dashboard/components/DashboardMoveModal";
import { ArchiveDashboardModalConnected } from "metabase/dashboard/containers/ArchiveDashboardModal";
import { AutomaticDashboardAppConnected } from "metabase/dashboard/containers/AutomaticDashboardApp";
import { DashboardAppConnected } from "metabase/dashboard/containers/DashboardApp/DashboardApp";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import { HomePage } from "metabase/home/components/HomePage";
import { trackPageView } from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import DatabaseMetabotApp from "metabase/metabot/containers/DatabaseMetabotApp";
import ModelMetabotApp from "metabase/metabot/containers/ModelMetabotApp";
import NewModelOptions from "metabase/models/containers/NewModelOptions";
import { getRoutes as getModelRoutes } from "metabase/models/routes";
import { PLUGIN_LANDING_PAGE, PLUGIN_COLLECTIONS } from "metabase/plugins";
import QueryBuilder from "metabase/query_builder/containers/QueryBuilder";
import { loadCurrentUser } from "metabase/redux/user";
import DatabaseDetailContainer from "metabase/reference/databases/DatabaseDetailContainer";
import DatabaseListContainer from "metabase/reference/databases/DatabaseListContainer";
import FieldDetailContainer from "metabase/reference/databases/FieldDetailContainer";
import FieldListContainer from "metabase/reference/databases/FieldListContainer";
import TableDetailContainer from "metabase/reference/databases/TableDetailContainer";
import TableListContainer from "metabase/reference/databases/TableListContainer";
import TableQuestionsContainer from "metabase/reference/databases/TableQuestionsContainer";
import SegmentDetailContainer from "metabase/reference/segments/SegmentDetailContainer";
import SegmentFieldDetailContainer from "metabase/reference/segments/SegmentFieldDetailContainer";
import SegmentFieldListContainer from "metabase/reference/segments/SegmentFieldListContainer";
import SegmentListContainer from "metabase/reference/segments/SegmentListContainer";
import SegmentQuestionsContainer from "metabase/reference/segments/SegmentQuestionsContainer";
import SegmentRevisionsContainer from "metabase/reference/segments/SegmentRevisionsContainer";
import SearchApp from "metabase/search/containers/SearchApp";
import { Setup } from "metabase/setup/components/Setup";
import getCollectionTimelineRoutes from "metabase/timelines/collections/routes";
import { BrowseDatabases } from "./browse/components/BrowseDatabases";
import { DatabasesConnections } from "./browse/components/DatabasesConnections";
import { BrowseModels } from "./browse/components/BrowseModels";
import BrowseSchemas from "./browse/components/BrowseSchemas";
import { BrowseTables } from "./browse/components/BrowseTables";
import {
  CanAccessMetabot,
  CanAccessSettings,
  IsAdmin,
  IsAuthenticated,
  IsNotAuthenticated,
} from "./route-guards";
import { getApplicationName } from "./selectors/whitelabel";
import { BrowseCubes } from "./browse/components/BrowseCubes";
import CubeFlow from "./components/Cube/CubeFlow";
import { BrowseSemanticLayers } from "./browse/components/BrowseSemanticLayers";
import { HomeLayout } from "./home/components/HomeLayout";
import { CompanySettings } from "./browse/components/CompanySettings/CompanySettings.tsx"
import { SettingsDatabases } from "./browse/components/CompanySettings/Databases.tsx"

import DatabaseEditApp from "metabase/admin/databases/containers/DatabaseEditApp";
import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import PeopleListingApp from "metabase/admin/people/containers/PeopleListingApp";
import UserActivationModal from "metabase/admin/people/containers/UserActivationModal";
import UserPasswordResetModal from "metabase/admin/people/containers/UserPasswordResetModal";
import UserSuccessModal from "metabase/admin/people/containers/UserSuccessModal";
import { CollectionPermissionsPage } from "./admin/permissions/pages/CollectionPermissionsPage/CollectionPermissionsPage";
import DataPermissionsPage from "./admin/permissions/pages/DataPermissionsPage";
import DatabasesPermissionsPage from "./admin/permissions/pages/DatabasePermissionsPage/DatabasesPermissionsPage";
import GroupsPermissionsPage from "./admin/permissions/pages/GroupDataPermissionsPage/GroupsPermissionsPage";
import { BrowseDatabasesSchemas } from "./browse/components/BrowseDatabasesSchemas";
import {
  createAdminRouteGuard,
} from "metabase/admin/utils";
import {
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_APPLICATION_PERMISSIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
} from "metabase/plugins";


export const getRoutes = store => {
  const applicationName = getApplicationName(store.getState());
  return (
    <Route title={applicationName} component={App}>
      {/* SETUP */}
      <Route
        path="/setup"
        component={Setup}
        onEnter={(nextState, replace) => {
          if (MetabaseSettings.hasUserSetup()) {
            replace("/");
          }
          trackPageView(location.pathname);
        }}
        onChange={(prevState, nextState) => {
          trackPageView(nextState.location.pathname);
        }}
      />

      {/* APP */}
      <Route
        onEnter={async (nextState, replace, done) => {
          await store.dispatch(loadCurrentUser());
          trackPageView(nextState.location.pathname);
          done();
        }}
        onChange={(prevState, nextState) => {
          if (nextState.location.pathname !== prevState.location.pathname) {
            trackPageView(nextState.location.pathname);
          }
        }}
      >
        {/* AUTH */}
        <Route path="/auth">
          <IndexRedirect to="/auth/login" />
          <Route component={IsNotAuthenticated}>
            <Route path="login" title={t`Login`} component={Login} />
            <Route path="login/:provider" title={t`Login`} component={Login} />
          </Route>
          <Route path="logout" component={Logout} />
          <Route path="forgot_password" component={ForgotPassword} />
          <Route path="reset_password/:token" component={ResetPassword} />
        </Route>

        {/* MAIN */}
        <Route component={IsAuthenticated}>
          {/* The global all hands routes, things in here are for all the folks */}
          <Route
            path="/"
            component={HomePage}
            onEnter={(nextState, replace) => {
              const page = PLUGIN_LANDING_PAGE[0] && PLUGIN_LANDING_PAGE[0]();
              if (page && page !== "/") {
                replace({
                  pathname: page[0] === "/" ? page : `/${page}`,
                  state: { preserveNavbarState: true },
                });
              }
            }}
          />
          <Route path="/settings" title={t`Settings`} component={CompanySettings} />
          <Route path="/settings/databases" title={t`Databases`} component={SettingsDatabases} />
          <Route path="/settings/databases/:databaseId" component={DatabaseEditApp} />
          <Route path="/settings/people" component={createAdminRouteGuard("people")}>

            <IndexRoute component={PeopleListingApp} />

            <Route path="" component={PeopleListingApp}>
              <ModalRoute path="new" modal={NewUserModal} />
            </Route>

            <Route path=":userId" component={PeopleListingApp}>
              <IndexRedirect to="/settings/people" />
              <ModalRoute path="edit" modal={EditUserModal} />
              <ModalRoute path="success" modal={UserSuccessModal} />
              <ModalRoute path="reset" modal={UserPasswordResetModal} />
              <ModalRoute path="deactivate" modal={UserActivationModal} />
              <ModalRoute path="reactivate" modal={UserActivationModal} />
              {PLUGIN_ADMIN_USER_MENU_ROUTES.map((getRoutes, index) => (
                <Fragment key={index}>{getRoutes(store)}</Fragment>
              ))}
            </Route>

          </Route>
          <Route path="/settings/permissions" title={t`Permissions`}>
            <IndexRedirect to="data" />
            <Route path="data" component={DataPermissionsPage}>
              <IndexRedirect to="group" />

              <Route
                path="database(/:databaseId)(/schema/:schemaName)(/table/:tableId)"
                component={DatabasesPermissionsPage}
              >
                {PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES}
                {PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES}
              </Route>

              <Route
                path="group(/:groupId)(/database/:databaseId)(/schema/:schemaName)"
                component={GroupsPermissionsPage}
              >
                {PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES}
                {PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES}
              </Route>
            </Route>

            <Route path="collections" component={CollectionPermissionsPage}>
              <Route path=":collectionId" />
            </Route>

            {PLUGIN_APPLICATION_PERMISSIONS.getRoutes()}
          </Route>


          <Route path="search" title={t`Search`} component={SearchApp} />
          {/* Send historical /archive route to trash - can remove in v52 */}
          <Redirect path="archive" to="trash" replace />
          <Route
            path="trash"
            title={t`Trash`}
            component={TrashCollectionLanding}
          />

          <Route path="collection/users" component={IsAdmin}>
            <IndexRoute component={UserCollectionList} />
          </Route>

          <Route path="collection/:slug" component={CollectionLanding}>
            <ModalRoute path="move" modal={MoveCollectionModal} noWrap />
            <ModalRoute path="archive" modal={ArchiveCollectionModal} />
            <ModalRoute path="permissions" modal={CollectionPermissionsModal} />
            {PLUGIN_COLLECTIONS.cleanUpRoute}
            {getCollectionTimelineRoutes()}
          </Route>

          <Route
            path="dashboard/:slug"
            title={t`Dashboard`}
            component={DashboardAppConnected}
          >
            <ModalRoute
              path="move"
              modal={DashboardMoveModalConnected}
              noWrap
            />
            <ModalRoute path="copy" modal={DashboardCopyModalConnected} />
            <ModalRoute path="archive" modal={ArchiveDashboardModalConnected} />
          </Route>

          <Route path="/question">
            <IndexRoute component={QueryBuilder} />
            <Route path="notebook" component={QueryBuilder} />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/metabot" component={QueryBuilder} />
            <Route path=":slug/:objectId" component={QueryBuilder} />
          </Route>

          <Route path="/metabot" component={CanAccessMetabot}>
            <Route path="database/:databaseId" component={DatabaseMetabotApp} />
            <Route path="model/:slug" component={ModelMetabotApp} />
          </Route>

          {/* MODELS */}
          {getModelRoutes()}

          <Route path="/model">
            <IndexRoute component={QueryBuilder} />
            <Route
              path="new"
              title={t`New Model`}
              component={NewModelOptions}
            />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/query" component={QueryBuilder} />
            <Route path=":slug/metadata" component={QueryBuilder} />
            <Route path=":slug/metabot" component={QueryBuilder} />
            <Route path=":slug/:objectId" component={QueryBuilder} />
            <Route path="query" component={QueryBuilder} />
            <Route path="metabot" component={QueryBuilder} />
          </Route>

          {/* METRICS V2 */}
          <Route path="/metric">
            <IndexRoute component={QueryBuilder} />
            <Route path="notebook" component={QueryBuilder} />
            <Route path="query" component={QueryBuilder} />
            <Route path=":slug" component={QueryBuilder} />
            <Route path=":slug/notebook" component={QueryBuilder} />
            <Route path=":slug/query" component={QueryBuilder} />
          </Route>

          <Route path="browse">
            <IndexRedirect to="/browse/models" />
            <Route path="models" component={BrowseModels} />
            <Route path="databases" component={BrowseDatabases} />
            <Route path="databases/:slug/schemas" component={BrowseDatabasesSchemas} />
            <Route path="databases/connections" component={DatabasesConnections} />
            <Route path="semantic-layer" component={BrowseSemanticLayers} />
            <Route path="semantic-layer/:slug" component={BrowseSemanticLayers} />
            <Route path="semantic-layer/:slug/cubes/:cubeName" component={BrowseCubes} />
            <Route path="semantic-layer/:slug/data-map" component={CubeFlow} />
            <Route path="chat" component={HomeLayout} />
            <Route path="insights" component={HomeLayout} />
            <Route path="databases/:slug" component={BrowseSchemas} />
            <Route
              path="databases/:dbId/schema/:schemaName"
              component={BrowseTables}
            />

            {/* These two Redirects support legacy paths in v48 and earlier */}
            <Redirect from=":dbId-:slug" to="databases/:dbId-:slug" />
            <Redirect
              from=":dbId/schema/:schemaName"
              to="databases/:dbId/schema/:schemaName"
            />
          </Route>

          {/* INDIVIDUAL DASHBOARDS */}

          <Route
            path="/auto/dashboard/*"
            component={AutomaticDashboardAppConnected}
          />

          {/* REFERENCE */}
          <Route path="/reference" title={t`Data Reference`}>
            <IndexRedirect to="/reference/databases" />
            <Route path="segments" component={SegmentListContainer} />
            <Route
              path="segments/:segmentId"
              component={SegmentDetailContainer}
            />
            <Route
              path="segments/:segmentId/fields"
              component={SegmentFieldListContainer}
            />
            <Route
              path="segments/:segmentId/fields/:fieldId"
              component={SegmentFieldDetailContainer}
            />
            <Route
              path="segments/:segmentId/questions"
              component={SegmentQuestionsContainer}
            />
            <Route
              path="segments/:segmentId/revisions"
              component={SegmentRevisionsContainer}
            />
            <Route path="databases" component={DatabaseListContainer} />
            <Route
              path="databases/:databaseId"
              component={DatabaseDetailContainer}
            />
            <Route
              path="databases/:databaseId/tables"
              component={TableListContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId"
              component={TableDetailContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/fields"
              component={FieldListContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/fields/:fieldId"
              component={FieldDetailContainer}
            />
            <Route
              path="databases/:databaseId/tables/:tableId/questions"
              component={TableQuestionsContainer}
            />
          </Route>

          {/* ACCOUNT */}
          {getAccountRoutes(store, IsAuthenticated)}

          {/* ADMIN */}
          {getAdminRoutes(store, CanAccessSettings, IsAdmin)}
        </Route>
      </Route>

      {/* DEPRECATED */}
      {/* NOTE: these custom routes are needed because <Redirect> doesn't preserve the hash */}
      <Route
        path="/q"
        onEnter={({ location }, replace) =>
          replace({ pathname: "/question", hash: location.hash })
        }
      />
      <Route
        path="/card/:slug"
        onEnter={({ location, params }, replace) =>
          replace({
            pathname: `/question/${params.slug}`,
            hash: location.hash,
          })
        }
      />
      <Redirect from="/dash/:dashboardId" to="/dashboard/:dashboardId" />
      <Redirect
        from="/collections/permissions"
        to="/admin/permissions/collections"
      />

      {/* MISC */}
      <Route path="/unsubscribe" component={UnsubscribePage} />
      <Route path="/unauthorized" component={Unauthorized} />
      <Route path="/*" component={NotFoundFallbackPage} />
    </Route>
  );
};
