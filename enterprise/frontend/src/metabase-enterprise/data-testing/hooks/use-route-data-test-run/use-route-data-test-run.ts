import { skipToken } from "metabase/api";
import { useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import { useGetDataTestRunQuery } from "metabase-enterprise/api";

type DataTestRunRouteParams = {
  runId: string;
};

export function useRouteDataTestRun() {
  const params = useParams<DataTestRunRouteParams>();
  const runId = Urls.extractEntityId(params.runId);
  const {
    data: run,
    isLoading,
    error,
  } = useGetDataTestRunQuery(runId ?? skipToken);

  return { run, isLoading, error };
}
