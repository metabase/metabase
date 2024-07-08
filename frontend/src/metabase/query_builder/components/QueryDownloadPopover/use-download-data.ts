import { useAsyncFn } from "react-use";
import type { AsyncFnReturn } from "react-use/lib/useAsyncFn";

import { useDispatch } from "metabase/lib/redux";
import { downloadQueryResults } from "metabase/query_builder/actions";
import type Question from "metabase-lib/v1/Question";
import type {
  DashboardId,
  DashCardId,
  Dataset,
  ParameterValuesMap,
  VisualizationSettings,
} from "metabase-types/api";

type UseDownloadDataParams = {
  question: Question;
  result: Dataset;
  dashboardId?: DashboardId;
  dashcardId?: DashCardId;
  uuid: string | undefined;
  token: string | undefined;
  params?: ParameterValuesMap;
  visualizationSettings?: VisualizationSettings;
};

type HandleDataDownloadParams = {
  type: string;
  enableFormatting: boolean;
};

export const useDownloadData = ({
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  params,
  visualizationSettings,
}: UseDownloadDataParams): AsyncFnReturn<
  (options: HandleDataDownloadParams) => Promise<void>
> => {
  const dispatch = useDispatch();

  return useAsyncFn(
    async ({ type, enableFormatting }: HandleDataDownloadParams) => {
      await dispatch(
        downloadQueryResults({
          type,
          enableFormatting,
          question,
          result,
          dashboardId,
          dashcardId,
          uuid,
          token,
          params,
          visualizationSettings,
        }),
      );
    },
    [
      dashboardId,
      dashcardId,
      params,
      question,
      result,
      token,
      uuid,
      visualizationSettings,
    ],
  );
};
