import { useCallback } from "react";
import { t } from "ttag";

import { Api, useCreateCardMutation } from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import { useChartPasteListener } from "metabase/common/hooks/use-chart-paste-listener";
import type { ChartClipboardPayload } from "metabase/common/utils/chart-clipboard";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type { Collection } from "metabase-types/api";

/**
 * Lets the user paste a copied Metabot chart (see `chart-clipboard`) into a
 * writable collection: the ad-hoc chart is materialized into a saved question in
 * that collection.
 */
export function useCollectionChartPaste(collection: Collection) {
  const dispatch = useDispatch();
  const [createCard] = useCreateCardMutation();

  const collectionId = collection.id;
  const collectionName = collection.name;
  const canWrite = Boolean(collection.can_write);

  const handlePasteChart = useCallback(
    async (payload: ChartClipboardPayload) => {
      try {
        await createCard({
          name: payload.name,
          display: payload.display,
          dataset_query: payload.dataset_query,
          visualization_settings: payload.visualization_settings,
          collection_id: canonicalCollectionId(collectionId),
        }).unwrap();
        dispatch(
          Api.util.invalidateTags([
            { type: "collection", id: `${collectionId}-items` },
          ]),
        );
        dispatch(
          addUndo({
            icon: "check_filled",
            message: t`Chart saved to ${collectionName}`,
          }),
        );
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: t`Couldn't save the chart to this collection`,
          }),
        );
      }
    },
    [createCard, dispatch, collectionId, collectionName],
  );

  useChartPasteListener(canWrite, handlePasteChart);
}
