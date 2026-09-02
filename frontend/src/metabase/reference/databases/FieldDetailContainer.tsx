import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import CS from "metabase/css/core/index.css";
import { getMetadata } from "metabase/metadata-store";
import { connect, useDispatch, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import FieldDetail from "metabase/reference/databases/FieldDetail";
import { fetchTableData } from "metabase/reference/fetch-data";
import * as actions from "metabase/reference/reference";
import { useReferenceFetch } from "metabase/reference/use-reference-fetch-state";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabase,
  getField,
  getIsEditing,
  getTable,
  getTableId,
} from "../selectors";

import FieldSidebar from "./FieldSidebar";

const mapDispatchToProps = {
  ...actions,
};

type FieldDetailContainerProps = ClearStateProps;

function FieldDetailContainer(props: FieldDetailContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const dispatch = useDispatch();
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
  const table = useSelector((state) => getTable(state, { params }));
  const field = useSelector((state) => getField(state, { params }));
  const tableId = useSelector((state) => getTableId(state, { params }));
  const isEditing = useSelector(getIsEditing);
  // `FieldDetail` reads `metadata` but doesn't select it itself.
  const metadata = useSelector(getMetadata);

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
      sidebar={<FieldSidebar database={database} table={table} field={field} />}
    >
      <FieldDetail
        params={params}
        metadata={metadata}
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
)(FieldDetailContainer as unknown as React.ComponentType);
