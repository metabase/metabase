import { useCallback, useRef } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { useChartPasteListener } from "metabase/common/hooks/use-chart-paste-listener";
import type { ChartClipboardPayload } from "metabase/common/utils/chart-clipboard";
import { addCardToDashboard } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

const PASTE_TOAST_ID = "dashboard-chart-paste";

export function useDashboardChartPaste() {
  const dispatch = useDispatch();
  const [createCard] = useCreateCardMutation();
  const { dashboard, isEditing, selectedTabId } = useDashboardContext();
  const isPastingRef = useRef(false);

  const dashboardId = dashboard?.id ?? null;

  const handlePasteChart = useCallback(
    async (payload: ChartClipboardPayload) => {
      if (dashboardId == null || isPastingRef.current) {
        return;
      }
      isPastingRef.current = true;
      const savedTabId =
        typeof selectedTabId === "number" && selectedTabId > 0
          ? selectedTabId
          : undefined;
      dispatch(
        addUndo({
          id: PASTE_TOAST_ID,
          icon: null,
          timeout: null,
          message: t`Adding chart to dashboard…`,
        }),
      );
      try {
        const card = await createCard({
          name: payload.name,
          description: payload.description ?? null,
          display: payload.display,
          dataset_query: payload.dataset_query,
          visualization_settings: payload.visualization_settings,
          dashboard_id: dashboardId,
          dashboard_tab_id: savedTabId,
        }).unwrap();
        await dispatch(
          addCardToDashboard({
            dashId: dashboardId,
            tabId: selectedTabId ?? null,
            cardId: card.id,
          }),
        );
        dispatch(
          addUndo({
            id: PASTE_TOAST_ID,
            icon: "check_filled",
            message: t`Chart added to dashboard`,
          }),
        );
      } catch {
        dispatch(
          addUndo({
            id: PASTE_TOAST_ID,
            icon: "warning",
            toastColor: "error",
            message: t`Couldn't add the chart to this dashboard`,
          }),
        );
      } finally {
        isPastingRef.current = false;
      }
    },
    [dispatch, createCard, dashboardId, selectedTabId],
  );

  useChartPasteListener(isEditing && dashboardId != null, handlePasteChart);
}
