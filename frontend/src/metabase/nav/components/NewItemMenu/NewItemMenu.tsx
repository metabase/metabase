import { useListDatabasesQuery } from "metabase/api";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import { getHasDatabaseWithJsonEngine } from "metabase/databases/utils/predicates";
import { useSelector } from "metabase/redux";

import { NewItemMenuView } from "./NewItemMenuView";

type NewItemMenuProps = Omit<
  React.ComponentProps<typeof NewItemMenuView>,
  "hasDataAccess" | "hasNativeWrite" | "hasDatabaseWithJsonEngine"
>;

export const NewItemMenu = (props: NewItemMenuProps) => {
  const { data: databasesResponse } = useListDatabasesQuery();
  const databases = databasesResponse?.data ?? [];
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const hasDatabaseWithJsonEngine = getHasDatabaseWithJsonEngine(databases);

  return (
    <NewItemMenuView
      {...props}
      hasDataAccess={hasDataAccess}
      hasNativeWrite={hasNativeWrite}
      hasDatabaseWithJsonEngine={hasDatabaseWithJsonEngine}
    />
  );
};
