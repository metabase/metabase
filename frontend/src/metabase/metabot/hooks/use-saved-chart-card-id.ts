import { skipToken, useGetCardQuery } from "metabase/api";
import { getSavedChartCardId } from "metabase/metabot/state";
import { useSelector } from "metabase/redux";
import { isResourceNotFoundError } from "metabase/utils/errors";
import type { CardId } from "metabase-types/api";

/**
 * The id of the question a Metabot chart was saved as, or `undefined` when it was not saved,
 * the question was deleted, or the question no longer comes from this chart.
 */
export const useSavedChartCardId = (chartId: string): CardId | undefined => {
  const recordedCardId = useSelector((state) =>
    getSavedChartCardId(state, chartId),
  );
  const { data: savedCard, error: savedCardError } = useGetCardQuery(
    recordedCardId != null
      ? { id: recordedCardId, ignore_error: true }
      : skipToken,
  );
  const isLinkSevered =
    isResourceNotFoundError(savedCardError) ||
    (savedCard != null && savedCard.metabot_chart_id !== chartId);
  return isLinkSevered ? undefined : recordedCardId;
};
