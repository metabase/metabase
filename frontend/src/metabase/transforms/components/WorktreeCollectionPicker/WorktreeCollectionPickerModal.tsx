import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListCollectionsTreeQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Tree } from "metabase/common/components/tree";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { Button, Group, Modal } from "metabase/ui";
import type { Collection, CollectionId, WorktreeId } from "metabase-types/api";

const ROOT_NODE_ID = "root";

type WorktreeCollectionPickerModalProps = {
  worktreeId: WorktreeId;
  value: CollectionId | null;
  title?: string;
  onChange: (collectionId: CollectionId | null) => void;
  onClose: () => void;
};

/**
 * A collection picker restricted to a single remote-sync worktree: content in
 * a worktree can only live within that worktree, so the regular collection
 * picker (which browses the main app) does not apply.
 */
export function WorktreeCollectionPickerModal({
  worktreeId,
  value,
  title = t`Select a collection`,
  onChange,
  onClose,
}: WorktreeCollectionPickerModalProps) {
  const [selectedId, setSelectedId] = useState<CollectionId | null>(value);

  const {
    data: collections = [],
    error,
    isLoading,
  } = useListCollectionsTreeQuery({
    namespace: "transforms",
    "exclude-archived": true,
    "worktree-id": worktreeId,
  });

  const treeData = useMemo(() => buildTreeData(collections), [collections]);

  const handleSelect = (item: ITreeNodeItem<CollectionId | null>) => {
    setSelectedId(item.data ?? null);
  };

  return (
    <Modal title={title} opened padding="xl" onClose={onClose}>
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <Tree
          data={treeData}
          selectedId={selectedId ?? ROOT_NODE_ID}
          onSelect={handleSelect}
          role="tree"
        />
      </LoadingAndErrorWrapper>
      <Group justify="flex-end" mt="lg">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button variant="filled" onClick={() => onChange(selectedId)}>
          {t`Select`}
        </Button>
      </Group>
    </Modal>
  );
}

function buildTreeData(
  collections: Collection[],
): ITreeNodeItem<CollectionId | null>[] {
  return [
    {
      id: ROOT_NODE_ID,
      name: t`Transforms`,
      icon: "folder",
      data: null,
      children: collections.map(buildCollectionNode),
    },
  ];
}

function buildCollectionNode(
  collection: Collection,
): ITreeNodeItem<CollectionId | null> {
  return {
    id: collection.id,
    name: collection.name,
    icon: "folder",
    data: collection.id,
    children: collection.children?.map(buildCollectionNode),
  };
}

export function findWorktreeCollectionName(
  collections: Collection[],
  collectionId: CollectionId | null | undefined,
): string | undefined {
  for (const collection of collections) {
    if (collection.id === collectionId) {
      return collection.name;
    }
    const childName = findWorktreeCollectionName(
      collection.children ?? [],
      collectionId,
    );
    if (childName != null) {
      return childName;
    }
  }
  return undefined;
}
