import { useCallback } from "react";
import { t } from "ttag";

import {
  CreateCollectionForm,
  type CreateCollectionProperties,
} from "metabase/common/collections/components/CreateCollectionForm";
import { Modal } from "metabase/ui";
import { useCreateWorktreeCollectionMutation } from "metabase-enterprise/api";
import type { RemoteSyncWorktree } from "metabase-types/api";

interface CreateWorktreeCollectionModalProps {
  worktree: RemoteSyncWorktree;
  onClose: () => void;
}

/**
 * The standard new-collection form without the location picker: the collection
 * is created at the root of the worktree. Sub-collections don't need this —
 * they are created from a worktree collection's own page and join the worktree
 * by inheritance.
 */
export const CreateWorktreeCollectionModal = ({
  worktree,
  onClose,
}: CreateWorktreeCollectionModalProps) => {
  const [createWorktreeCollection] = useCreateWorktreeCollectionMutation();

  const handleSubmit = useCallback(
    async ({
      name,
      description,
      authority_level,
    }: CreateCollectionProperties) => {
      await createWorktreeCollection({
        worktree_id: worktree.id,
        name,
        description,
        authority_level,
      }).unwrap();
      onClose();
    },
    [createWorktreeCollection, onClose, worktree.id],
  );

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      data-testid="new-collection-modal"
      padding="40px"
      title={t`New collection in "${worktree.branch}"`}
    >
      <CreateCollectionForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        showCollectionPicker={false}
      />
    </Modal>
  );
};
