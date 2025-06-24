import { useAsyncFn } from "react-use";
import type { AsyncFnReturn } from "react-use/lib/useAsyncFn";

import { useRootElement } from "metabase/common/hooks/use-root-element";
import { useDispatch } from "metabase/lib/redux";
import {
  type DownloadQueryResultsOpts,
  downloadQueryResults,
} from "metabase/redux/downloads";

export type UseDownloadDataParams = Pick<
  DownloadQueryResultsOpts,
  | "question"
  | "result"
  | "dashboardId"
  | "dashcardId"
  | "uuid"
  | "token"
  | "params"
  | "visualizationSettings"
>;

type HandleDataDownloadParams = Pick<
  DownloadQueryResultsOpts,
  "type" | "enableFormatting" | "enablePivot"
>;

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
  const rootElement = useRootElement();
  const dispatch = useDispatch();

  return useAsyncFn(
    async ({
      type,
      enableFormatting,
      enablePivot,
    }: HandleDataDownloadParams) => {
      await dispatch(
        downloadQueryResults({
          type,
          enableFormatting,
          enablePivot,
          question,
          result,
          dashboardId,
          dashcardId,
          uuid,
          token,
          params,
          visualizationSettings,
          rootElement,
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
