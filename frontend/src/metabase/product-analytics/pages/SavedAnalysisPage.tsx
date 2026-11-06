import { t } from "ttag";

import { useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useParams } from "metabase/router";
import { Alert } from "metabase/ui";
import { isConcreteTableId } from "metabase-types/api";
import { getQueryAnalysis } from "metabase-types/guards";

import { HabitAnalysis } from "../components/HabitAnalysis";

/** A saved analysis, opened as the chart it was saved with. */
export const SavedAnalysisPage = () => {
  const { cardId } = useParams();
  const {
    data: card,
    error,
    isLoading,
  } = useGetCardQuery({ id: Number(cardId) });

  if (card === undefined) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }
  if (
    getQueryAnalysis(card.dataset_query) === undefined ||
    !isConcreteTableId(card.table_id)
  ) {
    return <Alert m="xl">{t`This question isn't an analysis.`}</Alert>;
  }
  return <HabitAnalysis tableId={card.table_id} card={card} />;
};
