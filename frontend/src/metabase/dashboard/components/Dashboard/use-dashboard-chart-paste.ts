import { useCallback } from "react";
import { t } from "ttag";

import { useCreateCardMutation } from "metabase/api";
import { useChartPasteListener } from "metabase/common/hooks/use-chart-paste-listener";
import {
  type ChartClipboardPayload,
  chartPayloadToNewCard,
} from "metabase/common/utils/chart-clipboard";
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
      try {
        const card = await createCard({
          ...chartPayloadToNewCard(payload),
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
