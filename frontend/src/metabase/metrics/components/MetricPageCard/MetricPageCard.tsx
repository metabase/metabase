import type { ReactNode } from "react";

import { skipToken, useGetCardQueryQuery } from "metabase/api";
import { Unauthorized } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useLoadCardWithMetadata } from "metabase/common/data-studio/hooks/use-load-card-with-metadata";
import { Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import { is403Error } from "metabase/utils/errors";
import type { Card } from "metabase-types/api";

interface MetricPageCardProps {
  cardId: string;
  children: (card: Card) => ReactNode;
}

/**
 * Loads a metric card and gates access for every metric page: renders the
 * unauthorized screen when the card or its query is forbidden (403), otherwise
 * renders `children` with the loaded card. Uses the query result (not a
 * permission flag) so sandboxed/no-source-access users who can still view the
 * metric aren't wrongly blocked.
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
