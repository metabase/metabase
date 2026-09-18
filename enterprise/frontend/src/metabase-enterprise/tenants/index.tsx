import { Fragment } from "react";
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
import {
  type CollectionTreeItem,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/common/collections/utils";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { getIsTenantUser, getUserIsAdmin } from "metabase/current-user";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
  PLUGIN_TENANTS,
} from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { Route, redirect } from "metabase/router";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useSetting } from "metabase/settings";
import { Box, Text } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { EditUserStrategyModal } from "./EditUserStrategyModal";
import { EditUserStrategySettingsButton } from "./EditUserStrategySettingsButton";
import { CreateTenantsOnboardingStep } from "./components/CreateTenantsOnboardingStep";
import { MainNavSharedCollections } from "./components/MainNavSharedCollections";
import { ReactivateExternalUserButton } from "./components/ReactivateExternalUserButton";
import { TenantCollectionItemList } from "./components/TenantCollectionItemList";
import { TenantCollectionPermissionsPage } from "./components/TenantCollectionPermissionsPage";
import { TenantDisplayName } from "./components/TenantDisplayName";
import { FormTenantWidget } from "./components/TenantFormWidget";
import { TenantGroupHintIcon } from "./components/TenantGroupHintIcon";
import { TenantSpecificCollectionPermissionsPage } from "./components/TenantSpecificCollectionPermissionsPage";
import { TenantSpecificCollectionsItemList } from "./components/TenantSpecificCollectionsItemList";
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

/**
 * The tenant people and group pages wrap the admin pages of the same name, so
 * importing them here would hold those admin pages in the initial bundle. They
 * get a chunk of their own rather than the `admin` one: naming an `import()`
 * into a chunk another site already names merges the two module sets, which
 * copies whatever they shared into every other chunk that needs it.
 */
const externalPeopleListing = () =>
  import(
    /* webpackChunkName: "tenants" */ "./components/ExternalPeopleListingApp/ExternalPeopleListingApp"
  ).then(({ ExternalPeopleListingApp }) => ({
    Component: ExternalPeopleListingApp,
  }));

const externalGroupsListing = () =>
  import(
    /* webpackChunkName: "tenants" */ "./components/ExternalGroupsListingApp/ExternalGroupsListingApp"
  ).then(({ ExternalGroupsListingApp }) => ({
    Component: ExternalGroupsListingApp,
  }));

const externalGroupDetail = () =>
  import(
    /* webpackChunkName: "tenants" */ "./components/ExternalGroupDetailApp/ExternalGroupDetailApp"
  ).then(({ ExternalGroupDetailApp }) => ({
    Component: ExternalGroupDetailApp,
  }));

/**
 * The collection-facing tenant pages stay out of the `tenants` chunk above. That
 * chunk holds the admin listings, and a tenant user has no reason to download
 * them.
 */
const canAccessTenantSpecificRoute = () =>
  import(
    /* webpackChunkName: "tenant-collections" */ "./components/CanAccessTenantSpecificRoute"
  ).then(({ CanAccessTenantSpecificRoute }) => ({
    Component: CanAccessTenantSpecificRoute,
  }));

const tenantCollectionList = () =>
  import(
    /* webpackChunkName: "tenant-collections" */ "./components/TenantCollectionList"
  ).then(({ TenantCollectionList }) => ({ Component: TenantCollectionList }));

const tenantUsersList = () =>
  import(
    /* webpackChunkName: "tenant-users" */ "./components/TenantUsersList"
  ).then(({ TenantUsersList }) => ({
    Component: TenantUsersList,
  }));

const tenantUsersPersonalCollectionList = () =>
  import(
    /* webpackChunkName: "tenant-user-collections" */ "./components/TenantUsersPersonalCollectionList"
  ).then(({ TenantUsersPersonalCollectionList }) => ({
    Component: TenantUsersPersonalCollectionList,
  }));

export function initializePlugin() {
  if (hasPremiumFeature("tenants")) {
    PLUGIN_TENANTS.isEnabled = true;

    PLUGIN_TENANTS.useListActiveTenants = ({ skip } = {}) => {
      const { data, isLoading, error } = useListTenantsQuery(
        { status: "active" },
        { skip },
      );

      return { data: data?.data, isLoading, error };
    };

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
          element={<TenantCollectionPermissionsPage />}
        >
          <Route path=":collectionId" />
        </Route>
        <Route
          path="tenant-specific-collections"
          element={<TenantSpecificCollectionPermissionsPage />}
        >
          <Route path=":collectionId" />
        </Route>
      </>
    );

    PLUGIN_TENANTS.EditUserStrategyModal = EditUserStrategyModal;
    PLUGIN_TENANTS.CreateTenantsOnboardingStep = CreateTenantsOnboardingStep;
    PLUGIN_TENANTS.TenantsSummaryOnboardingStep = TenantsSummaryOnboardingStep;

    PLUGIN_TENANTS.userStrategyRoute = modalRoute(
      "user-strategy",
      EditUserStrategyModal,
      { noWrap: true },
    );

    PLUGIN_TENANTS.tenantsRoutes = (
      <>
        <Route index element={<TenantsListingApp />} />
        <Route path="" element={<TenantsListingApp />}>
          {modalRoute("new", NewTenantModal, { noWrap: true })}
          {modalRoute("user-strategy", EditUserStrategyModal, { noWrap: true })}
        </Route>
        <Route path="groups">
          <Route index lazy={externalGroupsListing} />
          <Route path=":groupId" lazy={externalGroupDetail} />
        </Route>
        <Route path="people" lazy={externalPeopleListing}>
          {modalRoute(
            "new",
            (props) => (
              <NewUserModal {...props} external />
            ),
            {
              noWrap: true,
            },
          )}
          <Route path=":userId">
            <Route index element={redirect("/admin/people/tenants/people")} />
            {modalRoute(
              "edit",
              (props) => (
                <EditUserModal {...props} external />
              ),
              { noWrap: true },
            )}
            {modalRoute("deactivate", UserActivationModal, { noWrap: true })}
            {modalRoute("reactivate", UserActivationModal, { noWrap: true })}
            {modalRoute("success", UserSuccessModal, { noWrap: true })}
            {modalRoute("reset", UserPasswordResetModal, { noWrap: true })}
            {PLUGIN_ADMIN_USER_MENU_ROUTES.map((getRoutes, index) => (
              <Fragment key={index}>{getRoutes()}</Fragment>
            ))}
          </Route>
        </Route>
        <Route path=":tenantId" element={<TenantsListingApp />}>
          {modalRoute("edit", EditTenantModal, { noWrap: true })}
          {modalRoute(
            "deactivate",
            // @ts-expect-error - params prop can't be inferred
            TenantActivationModal,
            { noWrap: true },
          )}
          {modalRoute(
            "reactivate",
            // @ts-expect-error - params prop can't be inferred
            TenantActivationModal,
            { noWrap: true },
          )}
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
    PLUGIN_TENANTS.tenantCollectionList = tenantCollectionList;
    PLUGIN_TENANTS.canAccessTenantSpecificRoute = canAccessTenantSpecificRoute;
    PLUGIN_TENANTS.tenantUsersList = tenantUsersList;
    PLUGIN_TENANTS.tenantUsersPersonalCollectionList =
      tenantUsersPersonalCollectionList;
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
