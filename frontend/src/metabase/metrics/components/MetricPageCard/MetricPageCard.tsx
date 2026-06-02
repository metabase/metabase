import type { ReactNode } from "react";

import { skipToken, useGetCardQueryQuery } from "metabase/api";
import { Unauthorized } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadCardWithMetadata } from "metabase/data-studio/common/hooks/use-load-card-with-metadata";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { is403Error } from "metabase/utils/errors";
import type { Card } from "metabase-types/api";

interface MetricPageCardProps {
  cardId: string;
  children: (card: Card) => ReactNode;
}

/**
 * Loads a metric card for a page and centralizes the access/loading/error gates
 * every metric page shares, then renders `children` with the loaded card.
 *
 * Access is denied when the card can't be read (403), or when running the
 * metric's query is forbidden (403). The query result is the source of truth:
 * metrics stay viewable for sandboxed users (and users without collection
 * access to a source model), whose query succeeds even though they can't run
 * ad-hoc queries against the underlying data. We wait for the query before
 * rendering so an inaccessible metric never flashes the page before the 403.
 */
export function MetricPageCard({
  cardId: rawCardId,
  children,
}: MetricPageCardProps) {
  const cardId = Urls.extractEntityId(rawCardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);
  const { error: datasetError, isLoading: isLoadingDataset } =
    useGetCardQueryQuery(cardId != null ? { cardId } : skipToken);

  if (is403Error(error) || is403Error(datasetError)) {
    return <Unauthorized />;
  }

  const loading = isLoading || isLoadingDataset;
  if (loading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={loading} error={error} />
      </Center>
    );
  }

  return <>{children(card)}</>;
}
