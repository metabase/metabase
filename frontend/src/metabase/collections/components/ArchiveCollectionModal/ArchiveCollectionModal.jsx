/* eslint-disable react/prop-types */
import { withRouter } from "react-router";
import { t } from "ttag";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { useSetArchive } from "metabase/common/hooks";
import * as Urls from "metabase/urls";

function ArchiveCollectionModalInner({ collection, onClose }) {
  const archive = useSetArchive();
  const handleArchive = () =>
    archive({ id: collection.id, model: "collection" }, true);

  return (
    <ArchiveModal
      title={t`Move this collection to trash?`}
      message={t`The dashboards, collections, and alerts in this collection will also be moved to the trash.`}
      model="collection"
      modelId={collection.id}
      onClose={onClose}
      onArchive={handleArchive}
    />
  );
}

function ArchiveCollectionModalContainer({ params, onClose }) {
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

export const ArchiveCollectionModal = withRouter(
  ArchiveCollectionModalContainer,
);
