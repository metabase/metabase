import { useListDatabasesQuery } from "metabase/api";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/current-user";
import { getHasDatabaseWithJsonEngine } from "metabase/databases/utils/predicates";
import { useDispatch, useSelector } from "metabase/redux";
import { closeNavbar } from "metabase/redux/app";

import { NewItemMenuView } from "./NewItemMenuView";

type NewItemMenuProps = Omit<
  React.ComponentProps<typeof NewItemMenuView>,
  | "hasDataAccess"
  | "hasNativeWrite"
  | "hasDatabaseWithJsonEngine"
  | "onCloseNavbar"
>;

export const NewItemMenu = (props: NewItemMenuProps) => {
  const { data: databasesResponse } = useListDatabasesQuery();
  const databases = databasesResponse?.data ?? [];
  const hasDataAccess = useSelector(canUserCreateQueries);
  const hasNativeWrite = useSelector(canUserCreateNativeQueries);
  const hasDatabaseWithJsonEngine = getHasDatabaseWithJsonEngine(databases);
  const dispatch = useDispatch();

  return (
    <NewItemMenuView
      {...props}
      hasDataAccess={hasDataAccess}
      hasNativeWrite={hasNativeWrite}
      hasDatabaseWithJsonEngine={hasDatabaseWithJsonEngine}
      onCloseNavbar={() => dispatch(closeNavbar())}
    />
  );
};
