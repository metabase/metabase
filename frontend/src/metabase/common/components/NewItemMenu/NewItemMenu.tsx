import { useListDatabasesQuery } from "metabase/api";
import { useDispatch, useSelector } from "metabase/redux";
import { closeNavbar } from "metabase/redux/app";
import { getHasDatabaseWithJsonEngine } from "metabase/selectors/data";
import {
  canUserCreateNativeQueries,
  canUserCreateQueries,
} from "metabase/selectors/user";

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
