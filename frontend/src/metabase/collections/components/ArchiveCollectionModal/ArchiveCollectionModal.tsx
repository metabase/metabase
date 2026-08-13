import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useSetArchive } from "metabase/archive/hooks";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

type OwnProps = {
  onClose: () => void;
};

type ArchiveCollectionModalRouteProps = OwnProps & {
  params: { slug?: string };
};

type ArchiveCollectionModalInnerProps = OwnProps & {
  collection: Collection;
};

function ArchiveCollectionModalInner({
  collection,
  onClose,
}: ArchiveCollectionModalInnerProps) {
  const archive = useSetArchive();
  const handleArchive = async () => {
    try {
      await archive({ id: collection.id, model: "collection" }, true);
    } catch (error) {
      throw new Error(
        getErrorMessage(error, t`Collection could not be archived.`),
      );
    }
  };

  return (
    <ArchiveModal
      title={t`Move this collection to trash?`}
      message={t`The dashboards, collections, and alerts in this collection will also be moved to the trash.`}
      model="collection"
      // Archivable collections always have a numeric id; special collections
      // (e.g. "root") are not archivable and only the analytics id is affected.
      modelId={typeof collection.id === "number" ? collection.id : null}
      onClose={onClose}
      onArchive={handleArchive}
    />
  );
}

export function ArchiveCollectionModal({
  params,
  onClose,
}: ArchiveCollectionModalRouteProps) {
  const collectionId = Urls.extractCollectionId(params.slug);
  const { data: collection } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );
  if (!collection) {
    return null;
  }
  return (
    <ArchiveCollectionModalInner collection={collection} onClose={onClose} />
  );
}
