import { useCallback } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { useChartPasteListener } from "metabase/common/hooks/use-chart-paste-listener";
import type { ChartClipboardPayload } from "metabase/common/utils/chart-clipboard";
import { addCardToDashboard } from "metabase/dashboard/actions";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDispatch } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";

/**
 * While editing a dashboard, lets the user paste a copied Metabot chart (see
 * `chart-clipboard`) onto the canvas: the ad-hoc chart is materialized into a
 * dashboard question and placed as a new dashcard.
 */
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
      try {
        const card = await createCard({
          name: payload.name,
          display: payload.display,
          dataset_query: payload.dataset_query,
          visualization_settings: payload.visualization_settings,
          dashboard_id: dashboardId,
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
