import { skipToken, useGetCardQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useParams } from "metabase/router";
import { getProductAnalyticsDefinition } from "metabase-types/guards";

import { AnalysisWorkspace } from "../components/AnalysisWorkspace";

const parseCardId = (value: string | undefined): number | undefined =>
  value !== undefined && /^\d+$/.test(value) ? Number(value) : undefined;

export const SavedAnalysisPage = () => {
  const { cardId } = useParams<{ cardId: string }>();
  const id = parseCardId(cardId);
  // currentData, not data: data keeps the previous card while another loads.
  const { currentData: card, error } = useGetCardQuery(
    id !== undefined ? { id } : skipToken,
  );

  if (id === undefined) {
    return <NotFound />;
  }
  if (card === undefined) {
    return (
      <LoadingAndErrorWrapper loading={error === undefined} error={error} />
    );
  }

  const definition = getProductAnalyticsDefinition(
    card?.visualization_settings,
  );
  if (definition === undefined) {
    return <NotFound />;
  }

  return (
    <AnalysisWorkspace
      key={card.id}
      kind={definition.kind}
      tableId={definition.table_id}
      savedCard={card}
      savedSettings={definition.settings}
    />
  );
};
