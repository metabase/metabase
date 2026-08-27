import { useCallback, useRef } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { canonicalCollectionId } from "metabase/common/collections/utils";
import { useChartPasteListener } from "metabase/common/hooks/use-chart-paste-listener";
import type { ChartClipboardPayload } from "metabase/common/utils/chart-clipboard";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import type { Collection } from "metabase-types/api";

const PASTE_TOAST_ID = "collection-chart-paste";

export function useCollectionChartPaste(collection: Collection) {
  const dispatch = useDispatch();
  const [createCard] = useCreateCardMutation();
  const isPastingRef = useRef(false);

  const { id, name, can_write } = collection;

  const handlePasteChart = useCallback(
    async (payload: ChartClipboardPayload) => {
      if (isPastingRef.current) {
        return;
      }
      isPastingRef.current = true;
      dispatch(
        addUndo({
          id: PASTE_TOAST_ID,
          icon: null,
          timeout: null,
          message: t`Saving chart to ${name}…`,
        }),
      );
      try {
        await createCard({
          name: payload.name,
          description: payload.description ?? null,
          display: payload.display,
          dataset_query: payload.dataset_query,
          visualization_settings: payload.visualization_settings,
          collection_id: canonicalCollectionId(id),
        }).unwrap();
        dispatch(
          addUndo({
            id: PASTE_TOAST_ID,
            icon: "check_filled",
            message: t`Chart saved to ${name}`,
          }),
        );
      } catch {
        dispatch(
          addUndo({
            id: PASTE_TOAST_ID,
            icon: "warning",
            toastColor: "error",
            message: t`Couldn't save the chart to this collection`,
          }),
        );
      } finally {
        isPastingRef.current = false;
      }
    },
    [createCard, dispatch, id, name],
  );

  useChartPasteListener(Boolean(can_write), handlePasteChart);
}
