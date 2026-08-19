import cx from "classnames";
import { useEffect } from "react";
import { usePrevious } from "react-use";

import { useGetDatabaseMetadataQuery, useListCardsQuery } from "metabase/api";
import CS from "metabase/css/core/index.css";
import { connect, useSelector } from "metabase/redux";
import { SidebarLayout } from "metabase/reference/components/SidebarLayout";
import TableQuestions from "metabase/reference/databases/TableQuestions";
import * as actions from "metabase/reference/reference";
import { useReferenceFetchState } from "metabase/reference/use-reference-fetch-state";
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
  ...actions,
};

interface TableQuestionsContainerProps extends FetchProps, ClearStateProps {}

function TableQuestionsContainer(props: TableQuestionsContainerProps) {
  const { pathname } = useLocation();
  const previousPathname = usePrevious(pathname);
  const params = useParams<ReferenceRouteParams>();

  const database = useSelector((state) => getDatabase(state, { params }));
  const table = useSelector((state) => getTable(state, { params }));
  const databaseId = useSelector((state) => getDatabaseId(state, { params }));
  const isEditing = useSelector(getIsEditing);

  const { isFetching: isFetchingMetadata, error: metadataError } =
    useGetDatabaseMetadataQuery({ id: databaseId, skip_fields: true });
  const { isFetching: isFetchingCards, error: cardsError } = useListCardsQuery(
    {},
  );
  useReferenceFetchState({
    isFetching: isFetchingMetadata || isFetchingCards,
    error: metadataError ?? cardsError,
  });

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
