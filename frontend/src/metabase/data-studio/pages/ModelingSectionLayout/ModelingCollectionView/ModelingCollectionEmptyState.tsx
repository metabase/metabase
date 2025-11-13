import { t } from "ttag";

import EmptyStateCollection from "assets/img/empty-states/collection.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { Center } from "metabase/ui";
import type { Collection } from "metabase-types/api";

type ModelingCollectionEmptyStateProps = {
  collection: Collection;
};

export function ModelingCollectionEmptyState({
  collection,
}: ModelingCollectionEmptyStateProps) {
  const { title, message } = getMessages(collection);

  return (
    <Center h="100%" bg="bg-light">
      <EmptyState
        illustrationElement={<img src={EmptyStateCollection} />}
        title={title}
        message={message}
      />
    </Center>
  );
}

function getMessages(collection: Collection) {
  switch (collection.type) {
    case "library-models":
      return {
        title: t`No models yet`,
        message: t`Put models in the Library to see them here.`,
      };
    case "library-metrics":
      return {
        title: t`No metrics yet`,
        message: t`Put metrics in the Library to see them here.`,
      };
    default:
      return {
        title: t`No models or metrics yet`,
        message: t`Models and metrics in this collection will appear here.`,
      };
  }
}
