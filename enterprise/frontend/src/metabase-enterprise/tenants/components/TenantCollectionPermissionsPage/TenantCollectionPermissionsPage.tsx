import type { Route } from "react-router";

import { CollectionPermissionsPage } from "metabase/admin/permissions/pages/CollectionPermissionsPage/CollectionPermissionsPage";
import type { CollectionIdProps } from "metabase/admin/permissions/pages/CollectionPermissionsPage/types";

import { getTenantCollectionPermissionsConfig } from "./config";

type Props = {
  params: CollectionIdProps["params"];
  route: Route;
};

export function TenantCollectionPermissionsPage({ params, route }: Props) {
  return (
    <CollectionPermissionsPage
      params={params}
      route={route}
      config={getTenantCollectionPermissionsConfig()}
    />
  );
}
