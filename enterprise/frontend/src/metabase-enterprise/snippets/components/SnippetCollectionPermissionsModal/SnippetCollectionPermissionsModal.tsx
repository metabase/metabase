import { useListCollectionsQuery } from "metabase/api";
import { CollectionPermissionsModal } from "metabase/permissions";
import type { SnippetCollectionPermissionsModalProps } from "metabase/plugins";
import { Modal } from "metabase/ui";

export function SnippetCollectionPermissionsModal({
  opened,
  collectionId,
  onClose,
}: SnippetCollectionPermissionsModalProps) {
  useListCollectionsQuery({ namespace: "snippets" });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      padding={0}
    >
      <CollectionPermissionsModal
        params={{ slug: String(collectionId) }}
        onClose={onClose}
        namespace="snippets"
      />
    </Modal>
  );
}
