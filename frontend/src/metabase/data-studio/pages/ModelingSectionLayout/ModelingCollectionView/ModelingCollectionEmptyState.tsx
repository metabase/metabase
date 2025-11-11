import { t } from "ttag";

import {
  CollectionEmptyIcon,
  EmptyStateSubtitle,
  EmptyStateTitle,
  EmptyStateWrapper,
} from "metabase/collections/components/CollectionEmptyState";

export function ModelingCollectionEmptyState() {
  return (
    <EmptyStateWrapper data-testid="modeling-collection-empty-state">
      <CollectionEmptyIcon />
      <EmptyStateTitle>{t`No models or metrics yet`}</EmptyStateTitle>
      <EmptyStateSubtitle>
        {t`Models and metrics in this collection will appear here.`}
      </EmptyStateSubtitle>
    </EmptyStateWrapper>
  );
}
