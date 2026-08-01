import { useCallback } from "react";
import { t } from "ttag";

import { useCreateCollectionMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  CreateCollectionForm,
  type CreateCollectionProperties,
} from "metabase/common/collections/components/CreateCollectionForm";
import { useToast } from "metabase/common/hooks";
import { Modal } from "metabase/ui";
import type {
  CollectionNamespace,
  RemoteSyncWorktreeId,
} from "metabase-types/api";

type NewNamespaceCollectionModalProps = {
  namespace: Extract<CollectionNamespace, "transforms" | "snippets">;
  /** The branch the collection is created on; `null` is the main branch. */
  worktreeId: RemoteSyncWorktreeId | null;
  onClose: () => void;
};

/**
 * The standard new-collection form without the location picker: the collection
 * is created at the root of its namespace. Sub-collections are created from a
 * folder's own page and inherit the namespace from their parent.
 */
export function NewNamespaceCollectionModal({
  namespace,
  worktreeId,
  onClose,
}: NewNamespaceCollectionModalProps) {
  const [sendToast] = useToast();
  const [createCollection] = useCreateCollectionMutation();

  const handleSubmit = useCallback(
    async ({ name, description }: CreateCollectionProperties) => {
      try {
        await createCollection({
          name,
          description: description ?? undefined,
          parent_id: null,
          namespace,
          worktree_id: worktreeId ?? undefined,
        }).unwrap();
        onClose();
      } catch (error) {
        sendToast({
          message: getErrorMessage(error, t`Failed to create collection`),
          icon: "warning",
        });
      }
    },
    [createCollection, namespace, worktreeId, onClose, sendToast],
  );

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      data-testid="new-collection-modal"
      padding="40px"
      title={t`New collection`}
    >
      <CreateCollectionForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        showCollectionPicker={false}
        showAuthorityLevelPicker={false}
      />
    </Modal>
  );
}
