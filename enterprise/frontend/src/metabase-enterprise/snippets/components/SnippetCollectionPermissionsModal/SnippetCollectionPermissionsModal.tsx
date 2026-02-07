import { useEffect } from "react";

import { CollectionPermissionsModal } from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { Modal } from "metabase/common/components/Modal";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import { useDispatch } from "metabase/lib/redux";
import type { SnippetCollectionPermissionsModalProps } from "metabase/plugins";

export function SnippetCollectionPermissionsModal({
  collectionId,
  onClose,
}: SnippetCollectionPermissionsModalProps) {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(SnippetCollections.actions.fetchList());
  }, [dispatch]);

  return (
    <Modal onClose={onClose}>
      <CollectionPermissionsModal
        params={{ slug: collectionId }}
        onClose={onClose}
        namespace="snippets"
      />
    </Modal>
  );
}
