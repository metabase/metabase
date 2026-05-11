import { useEffect } from "react";

import CollectionPermissionsModalBase from "metabase/admin/permissions/components/CollectionPermissionsModal/CollectionPermissionsModal";
import { Modal } from "metabase/common/components/Modal";
import { SnippetCollections } from "metabase/entities/snippet-collections";
import type { CollectionPermissionsModalProps } from "metabase/plugins";
import { useDispatch } from "metabase/redux";

export function CollectionPermissionsModal({
  collectionId,
  namespace,
  onClose,
}: CollectionPermissionsModalProps) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (namespace === "snippets") {
      dispatch(SnippetCollections.actions.fetchList());
    }
  }, [dispatch, namespace]);

  return (
    <Modal onClose={onClose}>
      <CollectionPermissionsModalBase
        params={{ slug: String(collectionId) }}
        namespace={namespace}
        onClose={onClose}
      />
    </Modal>
  );
}
