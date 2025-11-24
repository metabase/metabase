import { Fragment } from "react";
import { IndexRedirect, IndexRoute, Route } from "react-router";
import { t } from "ttag";

import { AdminPeopleApp } from "metabase/admin/people/containers/AdminPeopleApp";
import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { UserActivationModal } from "metabase/admin/people/containers/UserActivationModal";
import { UserPasswordResetModal } from "metabase/admin/people/containers/UserPasswordResetModal";
import { UserSuccessModal } from "metabase/admin/people/containers/UserSuccessModal";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { EditUserStrategyModal } from "./EditUserStrategyModal";
import { EditUserStrategySettingsButton } from "./EditUserStrategySettingsButton";
import { ExternalGroupDetailApp } from "./components/ExternalGroupDetailApp/ExternalGroupDetailApp";
import { ExternalGroupsListingApp } from "./components/ExternalGroupsListingApp/ExternalGroupsListingApp";
import { ExternalPeopleListingApp } from "./components/ExternalPeopleListingApp/ExternalPeopleListingApp";
import { MainNavSharedCollections } from "./components/MainNavSharedCollections";
import { ReactivateExternalUserButton } from "./components/ReactivateExternalUserButton";
import { TenantCollectionItemList } from "./components/TenantCollectionItemList";
import { TenantCollectionPermissionsPage } from "./components/TenantCollectionPermissionsPage";
import { TenantDisplayName } from "./components/TenantDisplayName";
import { FormTenantWidget } from "./components/TenantFormWidget";
import { TenantGroupHintIcon } from "./components/TenantGroupHintIcon";
import { EditTenantModal } from "./containers/EditTenantModal";
import { NewTenantModal } from "./containers/NewTenantModal";
import { TenantActivationModal } from "./containers/TenantActivationModal";
import { TenantsListingApp } from "./containers/TenantsListingApp";
import {
  isExternalUser,
  isExternalUsersGroup,
  isTenantCollection,
  isTenantGroup,
} from "./utils/utils";

export function initializePlugin() {
  if (hasPremiumFeature("tenants")) {
    // Register tenant collection permissions tab and routes
    PLUGIN_ADMIN_PERMISSIONS_TABS.tabs.push({
      name: t`Tenant Collections`,
      value: "tenant-collections",
    });

    PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes = () => (
      <Route
        path="tenant-collections"
        component={TenantCollectionPermissionsPage}
      >
        <Route path=":collectionId" />
      </Route>
    );

    PLUGIN_TENANTS.userStrategyRoute = (
      <ModalRoute path="user-strategy" modal={EditUserStrategyModal} noWrap />
    );

    PLUGIN_TENANTS.tenantsRoutes = (
      <>
        <Route {...{ title: t`Tenants` }} component={AdminPeopleApp}>
          <IndexRoute component={TenantsListingApp} />
          <Route path="" component={TenantsListingApp}>
            <ModalRoute path="new" modal={NewTenantModal} noWrap />
          </Route>
          <Route path="groups">
            <IndexRoute component={ExternalGroupsListingApp} />
            <Route path=":groupId" component={ExternalGroupDetailApp} />
          </Route>
          <Route path="people" component={ExternalPeopleListingApp}>
            <ModalRoute
              path="new"
              modal={(props) => <NewUserModal {...props} external />}
              noWrap
            />
            <Route path=":userId">
              <IndexRedirect to="/admin/tenants/people" />
              <ModalRoute
                path="edit"
                // @ts-expect-error - params prop can't be infered
                modal={(props) => <EditUserModal {...props} external />}
                noWrap
              />
              {/* @ts-expect-error - params prop can't be infered */}
              <ModalRoute
                path="deactivate"
                modal={UserActivationModal}
                noWrap
              />
              {/* @ts-expect-error - params prop can't be infered */}
              <ModalRoute
                path="reactivate"
                modal={UserActivationModal}
                noWrap
              />
              {/* @ts-expect-error - params prop can't be infered */}
              <ModalRoute path="success" modal={UserSuccessModal} noWrap />
              {/* @ts-expect-error - params prop can't be infered */}
              <ModalRoute path="reset" modal={UserPasswordResetModal} noWrap />
              {PLUGIN_ADMIN_USER_MENU_ROUTES.map((getRoutes, index) => (
                <Fragment key={index}>{getRoutes()}</Fragment>
              ))}
            </Route>
          </Route>
          <Route path=":tenantId" component={TenantsListingApp}>
            {/* @ts-expect-error - params prop can't be infered */}
            <ModalRoute path="edit" modal={EditTenantModal} noWrap />
            {/* @ts-expect-error - params prop can't be infered */}
            <ModalRoute
              path="deactivate"
              modal={TenantActivationModal}
              noWrap
            />
            {/* @ts-expect-error - params prop can't be infered */}
            <ModalRoute
              path="reactivate"
              modal={TenantActivationModal}
              noWrap
            />
          </Route>
        </Route>
      </>
    );

    PLUGIN_TENANTS.EditUserStrategySettingsButton =
      EditUserStrategySettingsButton;

    PLUGIN_TENANTS.FormTenantWidget = FormTenantWidget;
    PLUGIN_TENANTS.TenantDisplayName = TenantDisplayName;
    PLUGIN_TENANTS.isExternalUsersGroup = isExternalUsersGroup;
    PLUGIN_TENANTS.isTenantGroup = isTenantGroup;
    PLUGIN_TENANTS.isExternalUser = isExternalUser;
    PLUGIN_TENANTS.isTenantCollection = isTenantCollection;
    PLUGIN_TENANTS.ReactivateExternalUserButton = ReactivateExternalUserButton;
    PLUGIN_TENANTS.TenantGroupHintIcon = TenantGroupHintIcon;
    PLUGIN_TENANTS.MainNavSharedCollections = MainNavSharedCollections;
    PLUGIN_TENANTS.TenantCollectionItemList = TenantCollectionItemList;
  }
}
