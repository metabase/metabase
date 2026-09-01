import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import FieldList from "metabase/reference/databases/FieldList";
import { fetchTableData } from "metabase/reference/fetch-data";
import * as actions from "metabase/reference/reference";
import { useReferenceFetch } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabase,
  getIsEditing,
  getTable,
  getTableId,
} from "../selectors";

import TableSidebar from "./TableSidebar";

const mapDispatchToProps = {
  ...actions,
};

type FieldListContainerProps = ClearStateProps;

function FieldListContainer(props: FieldListContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const dispatch = useDispatch();
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
  const table = useSelector((state) => getTable(state, { params }));
  const tableId = useSelector((state) => getTableId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  const { loading, loadingError } = useReferenceFetch(() =>
    fetchTableData(dispatch, tableId),
  );

  useEffect(() => {
    const pathnameChanged =
      previousPathname !== undefined && previousPathname !== pathname;
    if (pathnameChanged) {
      actions.clearState(props);
    }
  }, [pathname, previousPathname, props]);

  return (
    <SidebarLayout
      className={cx(CS.flexFull, CS.relative)}
      style={isEditing ? { paddingTop: "43px" } : {}}
      sidebar={<TableSidebar database={database} table={table} />}
    >
      <FieldList
        params={params}
        loading={loading}
        loadingError={loadingError}
      />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(FieldListContainer as unknown as React.ComponentType);
