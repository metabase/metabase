import { t } from "ttag";

import {
  CollectionEmptyIcon,
  EmptyStateSubtitle,
  EmptyStateTitle,
  EmptyStateWrapper,
} from "metabase/collections/components/CollectionEmptyState";
import { PLUGIN_SEMANTIC_LAYER } from "metabase/plugins";
import type { Collection } from "metabase-types/api";

type ModelingCollectionEmptyStateProps = {
  collection: Collection;
};

export function ModelingCollectionEmptyState({
  collection,
}: ModelingCollectionEmptyStateProps) {
  const { title, description } = getMessages(collection);

  return (
    <EmptyStateWrapper data-testid="modeling-collection-empty-state">
      <CollectionEmptyIcon />
      <EmptyStateTitle>{title}</EmptyStateTitle>
      <EmptyStateSubtitle>{description}</EmptyStateSubtitle>
    </EmptyStateWrapper>
  );
}

function getMessages(collection: Collection) {
  const type = PLUGIN_SEMANTIC_LAYER.getSemanticLayerCollectionType(collection);

  switch (type) {
    case "models":
      return {
        title: t`No models yet`,
        description: t`Put models in the Semantic Layer to see them here.`,
      };
    case "metrics":
      return {
        title: t`No metrics yet`,
        description: t`Put metrics in the Semantic Layer to see them here.`,
      };
    default:
      return {
        title: t`No models or metrics yet`,
        description: t`Models and metrics in this collection will appear here.`,
      };
  }
}
