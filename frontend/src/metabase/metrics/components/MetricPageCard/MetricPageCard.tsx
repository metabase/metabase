import type { ReactNode } from "react";

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
 * Access is denied either when the card itself can't be read (403), or when the
 * user lacks data permission to run its query (`can_run_adhoc_query`). The
 * latter is computed by the backend from the card metadata, so every metric
 * page is guarded without having to run the query.
 */
export function MetricPageCard({
  cardId: rawCardId,
  children,
}: MetricPageCardProps) {
  const cardId = Urls.extractEntityId(rawCardId);
  const { card, isLoading, error } = useLoadCardWithMetadata(cardId);

  // A failure to even read the card is rejected by the API client, so it
  // surfaces as `error` with a 403 status.
  if (is403Error(error)) {
    return <Unauthorized />;
  }

  if (isLoading || error != null || card == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (card.can_run_adhoc_query === false) {
    return <Unauthorized />;
  }

  return <>{children(card)}</>;
}
