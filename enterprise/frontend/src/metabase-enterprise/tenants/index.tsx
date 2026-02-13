import { Fragment } from "react";
import { IndexRedirect, IndexRoute, Route } from "react-router";
import { t } from "ttag";

import { EditUserModal } from "metabase/admin/people/containers/EditUserModal";
import { NewUserModal } from "metabase/admin/people/containers/NewUserModal";
import { UserActivationModal } from "metabase/admin/people/containers/UserActivationModal";
import { UserPasswordResetModal } from "metabase/admin/people/containers/UserPasswordResetModal";
import { UserSuccessModal } from "metabase/admin/people/containers/UserSuccessModal";
import {
  useGetCollectionQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { useSetting } from "metabase/common/hooks/use-setting";
import {
  type CollectionTreeItem,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { getGroupNameLocalized } from "metabase/lib/groups";
import { useSelector } from "metabase/lib/redux";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { getIsTenantUser, getUserIsAdmin } from "metabase/selectors/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Text } from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { EditUserStrategyModal } from "./EditUserStrategyModal";
import { EditUserStrategySettingsButton } from "./EditUserStrategySettingsButton";
import { CanAccessTenantSpecificRoute } from "./components/CanAccessTenantSpecificRoute";
import { CreateTenantsOnboardingStep } from "./components/CreateTenantsOnboardingStep";
import { ExternalGroupDetailApp } from "./components/ExternalGroupDetailApp/ExternalGroupDetailApp";
import { ExternalGroupsListingApp } from "./components/ExternalGroupsListingApp/ExternalGroupsListingApp";
import { ExternalPeopleListingApp } from "./components/ExternalPeopleListingApp/ExternalPeopleListingApp";
import { MainNavSharedCollections } from "./components/MainNavSharedCollections";
import { ReactivateExternalUserButton } from "./components/ReactivateExternalUserButton";
import { TenantCollectionItemList } from "./components/TenantCollectionItemList";
import { TenantCollectionList } from "./components/TenantCollectionList";
import { TenantCollectionPermissionsPage } from "./components/TenantCollectionPermissionsPage";
import { TenantDisplayName } from "./components/TenantDisplayName";
import { FormTenantWidget } from "./components/TenantFormWidget";
import { TenantGroupHintIcon } from "./components/TenantGroupHintIcon";
import { TenantSpecificCollectionPermissionsPage } from "./components/TenantSpecificCollectionPermissionsPage";
import { TenantSpecificCollectionsItemList } from "./components/TenantSpecificCollectionsItemList";
import { TenantUsersList } from "./components/TenantUsersList";
import { TenantUsersPersonalCollectionList } from "./components/TenantUsersPersonalCollectionList";
import { TenantsSummaryOnboardingStep } from "./components/TenantsSummaryOnboardingStep";
import { EditTenantModal } from "./containers/EditTenantModal";
import { NewTenantModal } from "./containers/NewTenantModal";
import { TenantActivationModal } from "./containers/TenantActivationModal";
import { TenantsListingApp } from "./containers/TenantsListingApp";
import {
  SHARED_TENANT_NAMESPACE,
  TENANT_SPECIFIC_NAMESPACE,
} from "./utils/constants";
import {
  canPlaceEntityInCollection,
  getNamespaceDisplayName,
  getRootCollectionItem,
  isExternalUser,
  isExternalUsersGroup,
  isTenantCollection,
  isTenantGroup,
} from "./utils/utils";

export function initializePlugin() {
  if (hasPremiumFeature("tenants")) {
    PLUGIN_TENANTS.isEnabled = true;

    // Register tenant collection permissions tabs and routes
    PLUGIN_ADMIN_PERMISSIONS_TABS.tabs.push({
      name: t`Shared collections`,
      value: "tenant-collections",
    });

    PLUGIN_ADMIN_PERMISSIONS_TABS.tabs.push({
      name: t`Tenant collections`,
      value: "tenant-specific-collections",
    });

    PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes = () => (
      <>
        <Route
          path="tenant-collections"
          component={TenantCollectionPermissionsPage}
        >
          <Route path=":collectionId" />
        </Route>
        <Route
          path="tenant-specific-collections"
          component={TenantSpecificCollectionPermissionsPage}
        >
          <Route path=":collectionId" />
        </Route>
      </>
    );

    PLUGIN_TENANTS.EditUserStrategyModal = EditUserStrategyModal;
    PLUGIN_TENANTS.CreateTenantsOnboardingStep = CreateTenantsOnboardingStep;
    PLUGIN_TENANTS.TenantsSummaryOnboardingStep = TenantsSummaryOnboardingStep;

    PLUGIN_TENANTS.userStrategyRoute = (
      <ModalRoute path="user-strategy" modal={EditUserStrategyModal} noWrap />
    );

    PLUGIN_TENANTS.tenantsRoutes = (
      <>
        <IndexRoute component={TenantsListingApp} />
        <Route path="" component={TenantsListingApp}>
          <ModalRoute path="new" modal={NewTenantModal} noWrap />
          <ModalRoute
            path="user-strategy"
            modal={EditUserStrategyModal}
            noWrap
          />
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
            <IndexRedirect to="/admin/people/tenants/people" />
            <ModalRoute
              path="edit"
              // @ts-expect-error - params prop can't be inferred
              modal={(props) => <EditUserModal {...props} external />}
              noWrap
            />
            <ModalRoute
              path="deactivate"
              // @ts-expect-error - params prop can't be inferred
              modal={UserActivationModal}
              noWrap
            />
            <ModalRoute
              path="reactivate"
              // @ts-expect-error - params prop can't be inferred
              modal={UserActivationModal}
              noWrap
            />
            {/* @ts-expect-error - params prop can't be inferred */}
            <ModalRoute path="success" modal={UserSuccessModal} noWrap />
            {/* @ts-expect-error - params prop can't be inferred */}
            <ModalRoute path="reset" modal={UserPasswordResetModal} noWrap />
            {PLUGIN_ADMIN_USER_MENU_ROUTES.map((getRoutes, index) => (
              <Fragment key={index}>{getRoutes()}</Fragment>
            ))}
          </Route>
        </Route>
        <Route path=":tenantId" component={TenantsListingApp}>
          <ModalRoute
            path="edit"
            // @ts-expect-error - params prop can't be inferred
            modal={EditTenantModal}
            noWrap
          />
          <ModalRoute
            path="deactivate"
            // @ts-expect-error - params prop can't be inferred
            modal={TenantActivationModal}
            noWrap
          />
          <ModalRoute
            path="reactivate"
            // @ts-expect-error - params prop can't be inferred
            modal={TenantActivationModal}
            noWrap
          />
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
    PLUGIN_TENANTS.TenantSpecificCollectionsItemList =
      TenantSpecificCollectionsItemList;
    PLUGIN_TENANTS.TenantCollectionList = TenantCollectionList;
    PLUGIN_TENANTS.CanAccessTenantSpecificRoute = CanAccessTenantSpecificRoute;
    PLUGIN_TENANTS.TenantUsersList = TenantUsersList;
    PLUGIN_TENANTS.TenantUsersPersonalCollectionList =
      TenantUsersPersonalCollectionList;
    PLUGIN_TENANTS.canPlaceEntityInCollection = canPlaceEntityInCollection;

    // Category 1: UI Components
    PLUGIN_TENANTS.GroupDescription = function GroupDescription({ group }) {
      const applicationName = useSelector(getApplicationName);
      if (isExternalUsersGroup(group)) {
        return (
          <Box maw="38rem" px="1rem">
            <Text>
              {t`All tenant users belong to the ${getGroupNameLocalized(
                group,
              )} group and can't be removed from it. Setting permissions for this group is a great way to make sure you know what new ${applicationName} users will be able to see.`}
            </Text>
          </Box>
        );
      }
      return null;
    };

    PLUGIN_TENANTS.getNewUserModalTitle = (isExternal: boolean) => {
      return isExternal ? t`Create tenant user` : null;
    };

    PLUGIN_TENANTS.getFormGroupsTitle = (isExternal: boolean) => {
      return isExternal ? t`Tenant groups` : null;
    };

    // Category 2: Collection namespace utilities
    PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE = SHARED_TENANT_NAMESPACE;
    PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE = TENANT_SPECIFIC_NAMESPACE;
    PLUGIN_TENANTS.getTenantRootDisabledReason = () =>
      t`Items cannot be saved directly to the tenant root collection. Please select a sub-collection.`;
    PLUGIN_TENANTS.getNamespaceDisplayName = getNamespaceDisplayName;
    PLUGIN_TENANTS.getRootCollectionItem = getRootCollectionItem;
    PLUGIN_TENANTS.getFlattenedCollectionsForNavbar = ({
      currentUser,
      sharedTenantCollections,
      regularCollections = [],
    }) => {
      if (currentUser?.tenant_collection_id) {
        const sharedTenantCollectionTree = buildCollectionTree(
          sharedTenantCollections,
        );
        const userTenantCollectionId = currentUser?.tenant_collection_id;

        const ourDataCollection: CollectionTreeItem = {
          id: userTenantCollectionId,
          name: t`Our data`,
          description: null,
          can_write: true,
          can_restore: false,
          can_delete: false,
          archived: false,
          namespace: null,
          location: "/",
          icon: getCollectionIcon({ id: userTenantCollectionId }),
          children: [],
        };

        return [
          ...sharedTenantCollectionTree,
          ourDataCollection,
          ...regularCollections,
        ];
      }

      // fallback, but should never happen
      return regularCollections;
    };
    PLUGIN_TENANTS.useTenantMainNavbarData = () => {
      const isTenantUser = useSelector(getIsTenantUser);
      const isAdmin = useSelector(getUserIsAdmin);
      const useTenants = useSetting("use-tenants");

      const { data: sharedTenantCollections } = useListCollectionsTreeQuery(
        { namespace: "shared-tenant-collection" },
        { skip: !useTenants },
      );

      // Fetch shared collection root for non-tenant users to check write permissions
      const { data: sharedCollectionRoot } = useGetCollectionQuery(
        { id: "root", namespace: "shared-tenant-collection" },
        { skip: !useTenants || isTenantUser },
      );

      // Check if non-admin user has access to tenant-specific namespace
      const { data: tenantSpecificRoot } = useGetCollectionQuery(
        { id: "root", namespace: "tenant-specific" },
        { skip: !useTenants || isTenantUser || isAdmin },
      );
      const canAccessTenantSpecificCollections =
        isAdmin || !!tenantSpecificRoot;

      // Non-admins can create shared collections if they have curate permissions on the root shared collection
      const canCreateSharedCollection =
        sharedCollectionRoot?.can_write ?? false;
      const hasVisibleSharedCollections =
        (sharedTenantCollections?.length ?? 0) > 0;
      const showExternalCollectionsSection =
        useTenants &&
        !isTenantUser &&
        (hasVisibleSharedCollections ||
          canCreateSharedCollection ||
          canAccessTenantSpecificCollections);

      return {
        canAccessTenantSpecificCollections,
        canCreateSharedCollection,
        showExternalCollectionsSection,
        sharedTenantCollections,
      };
    };
  }
}
