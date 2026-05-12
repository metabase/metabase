/* eslint-disable react/prop-types */
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { useSetArchive } from "metabase/common/hooks";
import { Collections } from "metabase/entities/collections";
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

export const ArchiveCollectionModal = _.compose(
  Collections.load({
    id: (state, props) => Urls.extractCollectionId(props.params.slug),
  }),
  withRouter,
)(ArchiveCollectionModalInner);
