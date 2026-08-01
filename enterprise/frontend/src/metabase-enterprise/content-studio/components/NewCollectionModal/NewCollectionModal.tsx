import { useCallback } from "react";

import CreateCollectionModal from "metabase/common/collections/containers/CreateCollectionModal";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import { useWorktrees } from "metabase-enterprise/remote_sync/hooks/use-worktrees";
import type { Collection, CollectionNamespace } from "metabase-types/api";

import { useScopeCollectionTree } from "../../collection-tree";
import { useContentStudioScope } from "../../scope";

import { NewBranchCollectionModal } from "./NewBranchCollectionModal";
import { NewNamespaceCollectionModal } from "./NewNamespaceCollectionModal";

type NewCollectionModalProps = {
  /** Where the collection goes; defaults to the top of the branch on screen. */
  parentCollection?: Collection;
  /** The namespace a top-level collection belongs to; collections by default. */
  namespace?: Extract<CollectionNamespace, "transforms" | "snippets">;
  onClose: () => void;
};

/**
 * Creates a collection in the branch the studio is scoped to — under
 * `parentCollection` when one is given, at the top of the branch otherwise.
 */
export function NewCollectionModal({
  parentCollection,
  namespace,
  onClose,
}: NewCollectionModalProps) {
  const navigate = useNavigate();
  const { worktreeId } = useContentStudioScope();
  const { worktrees } = useWorktrees();
  const { nodes } = useScopeCollectionTree();

  const handleCreate = useCallback(
    (collection: Collection) => {
      navigate(Urls.contentStudioCollection(collection));
    },
    [navigate],
  );

  const selectedWorktree = worktrees.find(
    (worktree) => worktree.id === worktreeId,
  );

  if (parentCollection) {
    return (
      <CreateCollectionModal
        initialCollectionId={parentCollection.id}
        showCollectionPicker={parentCollection.worktree_id == null}
        onCreate={handleCreate}
        onClose={onClose}
      />
    );
  }

  if (namespace) {
    return (
      <NewNamespaceCollectionModal
        namespace={namespace}
        worktreeId={worktreeId}
        onClose={onClose}
      />
    );
  }

  if (selectedWorktree) {
    return (
      <NewBranchCollectionModal worktree={selectedWorktree} onClose={onClose} />
    );
  }

  return (
    <CreateCollectionModal
      initialCollectionId={nodes[0]?.data.id}
      onCreate={handleCreate}
      onClose={onClose}
    />
  );
}
