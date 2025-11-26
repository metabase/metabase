import { t } from "ttag";

import EmptyStateCollection from "assets/img/empty-states/collection.svg";
import EmptyState from "metabase/common/components/EmptyState";
import { PLUGIN_DATA_STUDIO } from "metabase/plugins";
import { Center } from "metabase/ui";
import type { Collection } from "metabase-types/api";

type CollectionEmptyStateProps = {
  collection: Collection;
};

export function CollectionEmptyState({
  collection,
}: CollectionEmptyStateProps) {
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
  switch (PLUGIN_DATA_STUDIO.getLibraryCollectionType(collection.type)) {
    case "models":
      return {
        title: t`No tables or models yet`,
        message: t`Publish tables in the Library to see them here.`,
      };
    case "metrics":
      return {
        title: t`No metrics yet`,
        message: t`Put metrics in the Library to see them here.`,
      };
    default:
      return {
        title: t`No tables or metrics yet`,
        message: t`Tables and metrics in this collection will appear here.`,
      };
  }
}
