import cx from "classnames";
import { useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import * as metadataActions from "metabase/redux/metadata";
import type { Dispatch } from "metabase/redux/store";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import TableQuestions from "metabase/reference/databases/TableQuestions";
import * as actions from "metabase/reference/reference";
import { useLocation, useParams } from "metabase/router";

import type { ClearStateProps, FetchProps } from "../reference";
import {
  type ReferenceRouteParams,
  getDatabase,
  getDatabaseId,
  getIsEditing,
  getTable,
} from "../selectors";

import TableSidebar from "./TableSidebar";

const mapDispatchToProps = {
  fetchQuestions: () => (dispatch: Dispatch) =>
    runRtkEndpoint({}, dispatch, cardApi.endpoints.listCards),
  ...metadataActions,
  ...actions,
};

interface TableQuestionsContainerProps extends FetchProps, ClearStateProps {
  fetchDatabaseMetadata: (id: number) => Promise<unknown>;
  fetchQuestions: () => Promise<unknown>;
}

function TableQuestionsContainer(props: TableQuestionsContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
  const table = useSelector((state) => getTable(state, { params }));
  const databaseId = useSelector((state) => getDatabaseId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  // Dispatched during render, not from an effect, to reproduce the
  // `UNSAFE_componentWillMount` this replaced: the child reads `loading` from
  // the store, so it has to be true before the child's first render. From an
  // effect (even `useLayoutEffect`) the tree commits once with no data, and the
  // reference header lays out wrong — see DEV-2430.
  const didFetch = useRef(false);
  if (!didFetch.current) {
    didFetch.current = true;
    actions.wrappedFetchDatabaseMetadataAndQuestion(props, databaseId);
  }

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
      <TableQuestions params={params} />
    </SidebarLayout>
  );
}

// connect HOC tangle: action-type constants in `actions` + JS-typed metadata thunks.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  null,
  mapDispatchToProps,
  // Unjustified type cast. FIXME
)(TableQuestionsContainer as unknown as React.ComponentType);
