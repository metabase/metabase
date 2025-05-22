import { IndexRoute } from "react-router";
import { t } from "ttag";

import { AdminPeopleApp } from "metabase/admin/people/containers/AdminPeopleApp";
import { createAdminRouteGuard } from "metabase/admin/utils";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { Route } from "metabase/hoc/Title";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { EditUserStrategyModal } from "./EditUserStrategyModal";
import { EditUserStrategySettingsButton } from "./EditUserStrategySettingsButton";
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
        <Route path=":tenantId" component={TenantsListingApp}>
          <ModalRoute path="edit" modal={EditTenantModal} noWrap />
          <ModalRoute path="deactivate" modal={TenantActivationModal} noWrap />
          <ModalRoute path="reactivate" modal={TenantActivationModal} noWrap />
        </Route>
      </Route>
    </Route>
  );

  PLUGIN_TENANTS.EditUserStrategySettingsButton =
    EditUserStrategySettingsButton;
}
