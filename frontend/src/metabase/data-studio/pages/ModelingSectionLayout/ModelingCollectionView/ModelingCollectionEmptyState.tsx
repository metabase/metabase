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
  const allowedTypes = collection.allowed_content ?? [];
  const hasOnlyModels =
    allowedTypes.includes("dataset") && !allowedTypes.includes("metric");
  const hasOnlyMetrics =
    allowedTypes.includes("metric") && !allowedTypes.includes("dataset");
  const isSemanticLayer =
    PLUGIN_SEMANTIC_LAYER.isSemanticLayerCollection(collection);

  if (hasOnlyModels) {
    return {
      title: t`No models yet`,
      description: isSemanticLayer
        ? t`Put models in the Semantic Layer to see them here.`
        : t`Models in this collection will appear here.`,
    };
  }

  if (hasOnlyMetrics) {
    return {
      title: t`No metrics yet`,
      description: isSemanticLayer
        ? t`Put metrics in the Semantic Layer to see them here.`
        : t`Metrics in this collection will appear here.`,
    };
  }

  return {
    title: t`No models or metrics yet`,
    description: t`Models and metrics in this collection will appear here.`,
  };
}
