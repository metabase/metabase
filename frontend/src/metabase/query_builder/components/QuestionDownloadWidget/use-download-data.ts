import { useAsyncFn } from "react-use";
import type { AsyncFnReturn } from "react-use/lib/useAsyncFn";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import {
  type ExportQueryResultsOpts,
  exportQueryResults,
} from "metabase/redux/downloads";
import { addUndo } from "metabase/redux/undo";

export type UseDownloadDataParams = Pick<
  ExportQueryResultsOpts,
  | "question"
  | "result"
  | "dashboardId"
  | "dashcardId"
  | "uuid"
  | "token"
  | "documentUuid"
  | "documentId"
  | "params"
  | "visualizationSettings"
>;

type HandleDataDownloadParams = Pick<
  ExportQueryResultsOpts,
  "type" | "enableFormatting" | "enablePivot" | "exportVariant"
>;

export const useDownloadData = ({
  question,
  result,
  dashboardId,
  dashcardId,
  uuid,
  token,
  documentUuid,
  documentId,
  params,
  visualizationSettings,
}: UseDownloadDataParams): AsyncFnReturn<
  (options: HandleDataDownloadParams) => Promise<void>
> => {
  const dispatch = useDispatch();

  return useAsyncFn(
    async ({
      type,
      enableFormatting,
      enablePivot,
      exportVariant,
    }: HandleDataDownloadParams) => {
      await dispatch(
        exportQueryResults({
          type,
          enableFormatting,
          enablePivot,
          question,
          result,
          dashboardId,
          dashcardId,
          uuid,
          token,
          documentUuid,
          documentId,
          params,
          visualizationSettings,
          exportVariant,
        }),
      );
      if (exportVariant === "copy-to-clipboard") {
        dispatch(addUndo({ message: t`Data copied to clipboard` }));
      }
    },
    [
      dashboardId,
      dashcardId,
      documentUuid,
      documentId,
      params,
      question,
      result,
      token,
      uuid,
      visualizationSettings,
    ],
  );
};
