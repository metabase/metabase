import { IndexRedirect, IndexRoute } from "react-router";
import { t } from "ttag";

import { AdminPeopleApp } from "metabase/admin/people/containers/AdminPeopleApp";
import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { UserActivationModal } from "metabase/admin/people/containers/UserActivationModal";
import { createAdminRouteGuard } from "metabase/admin/utils";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { EditUserStrategyModal } from "./EditUserStrategyModal";
import { EditUserStrategySettingsButton } from "./EditUserStrategySettingsButton";
import { ExternalPeopleListingApp } from "./components/ExternalPeopleListingApp/ExternalPeopleListingApp";
import { TenantDisplayName } from "./components/TenantDisplayName";
import { FormTenantWidget } from "./components/TenantFormWidget";
import { EditTenantModal } from "./containers/EditTenantModal";
import { NewTenantModal } from "./containers/NewTenantModal";
import { TenantActivationModal } from "./containers/TenantActivationModal";
import { TenantsListingApp } from "./containers/TenantsListingApp";

// TODO remove `true` once feature is enabled for dev token
// eslint-disable-next-line no-constant-condition
if (true || hasPremiumFeature("tenants")) {
  PLUGIN_TENANTS.userStrategyRoute = (
    <ModalRoute path="user-strategy" modal={EditUserStrategyModal} noWrap />
  );

  PLUGIN_TENANTS.tenantsRoutes = (
    <Route path="tenants" component={createAdminRouteGuard("people")}>
      <Route {...{ title: t`Tenants` }} component={AdminPeopleApp}>
        <IndexRoute component={TenantsListingApp} />
        <Route path="" component={TenantsListingApp}>
          <ModalRoute path="new" modal={NewTenantModal} noWrap />
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
            <ModalRoute path="deactivate" modal={UserActivationModal} noWrap />
            {/* @ts-expect-error - params prop can't be infered */}
            <ModalRoute path="reactivate" modal={UserActivationModal} noWrap />
          </Route>
        </Route>
        <Route path=":tenantId" component={TenantsListingApp}>
          {/* @ts-expect-error - params prop can't be infered */}
          <ModalRoute path="edit" modal={EditTenantModal} noWrap />
          {/* @ts-expect-error - params prop can't be infered */}
          <ModalRoute path="deactivate" modal={TenantActivationModal} noWrap />
          {/* @ts-expect-error - params prop can't be infered */}
          <ModalRoute path="reactivate" modal={TenantActivationModal} noWrap />
        </Route>
      </Route>
    </Route>
  );

  PLUGIN_TENANTS.EditUserStrategySettingsButton =
    EditUserStrategySettingsButton;

  PLUGIN_TENANTS.FormTenantWidget = FormTenantWidget;
  PLUGIN_TENANTS.TenantDisplayName = TenantDisplayName;
}
