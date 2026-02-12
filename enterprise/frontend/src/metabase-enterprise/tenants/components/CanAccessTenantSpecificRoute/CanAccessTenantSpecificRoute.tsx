import type { ReactNode } from "react";

import { useGetCollectionQuery } from "metabase/api";
import { Unauthorized } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";

type Props = {
  children: ReactNode;
};

export const CanAccessTenantSpecificRoute = ({ children }: Props) => {
  const isAdmin = useSelector(getUserIsAdmin);

  // Admins always have access, skip the API call
  const { data, isLoading } = useGetCollectionQuery(
    { id: "root", namespace: "tenant-specific" },
    { skip: isAdmin },
  );

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  // If we got data back, user has access
  if (data) {
    return <>{children}</>;
  }

  // Error or no data means no access
  return <Unauthorized />;
};
