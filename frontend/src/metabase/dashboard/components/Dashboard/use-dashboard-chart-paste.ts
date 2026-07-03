import { useCallback } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { useChartPasteListener } from "metabase/common/hooks/use-chart-paste-listener";
import type { ChartClipboardPayload } from "metabase/common/utils/chart-clipboard";
import { addCardToDashboard } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

export function useDashboardChartPaste() {
  const dispatch = useDispatch();
  const [createCard] = useCreateCardMutation();
  const { dashboard, isEditing, selectedTabId } = useDashboardContext();

  const dashboardId = dashboard?.id ?? null;

  const handlePasteChart = useCallback(
    async (payload: ChartClipboardPayload) => {
      if (dashboardId == null) {
        return;
      }
      const savedTabId =
        typeof selectedTabId === "number" && selectedTabId > 0
          ? selectedTabId
          : undefined;
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
            icon: "check_filled",
            message: t`Chart added to dashboard`,
          }),
        );
      } catch {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: t`Couldn't add the chart to this dashboard`,
          }),
        );
      }
    },
    [dispatch, createCard, dashboardId, selectedTabId],
  );

  useChartPasteListener(isEditing && dashboardId != null, handlePasteChart);
}
