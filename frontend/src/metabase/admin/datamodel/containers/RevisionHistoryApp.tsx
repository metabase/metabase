import { useEffect } from "react";

import { useGetSegmentQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadTableWithMetadata } from "metabase/data-studio/common/hooks/use-load-table-with-metadata";
import { useDispatch, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getUser } from "metabase/selectors/user";
import { checkNotNull } from "metabase/utils/types";

import { RevisionHistory } from "../components/revisions/RevisionHistory";
import { fetchSegmentRevisions } from "../datamodel";
import { getRevisions } from "../selectors";

type RevisionHistoryAppProps = {
  params: {
    id: string;
  };
};

export function RevisionHistoryApp({ params }: RevisionHistoryAppProps) {
  const { id } = params;
  const dispatch = useDispatch();
  const user = checkNotNull(useSelector(getUser));
  const revisions = useSelector((state: State) => getRevisions(state));
  const segmentId = parseInt(id, 10);

  const {
    data: segment,
    isLoading: isLoadingSegment,
    error: segmentError,
  } = useGetSegmentQuery(segmentId);

  const { isLoading: isLoadingTable, error: tableError } =
    useLoadTableWithMetadata(segment?.table_id, {
      includeForeignTables: true,
    });

  useEffect(() => {
    dispatch(fetchSegmentRevisions(id));
  }, [dispatch, id]);

  const isLoading = isLoadingSegment || isLoadingTable;
  const error = segmentError ?? tableError;

  if (isLoading || error || !segment) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <RevisionHistory revisions={revisions} segment={segment} user={user} />
  );
}
