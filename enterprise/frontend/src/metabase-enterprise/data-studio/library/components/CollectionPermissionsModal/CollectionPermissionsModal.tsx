import { skipToken, useListCollectionsQuery } from "metabase/api";
import { CollectionPermissionsModal as CollectionPermissionsModalBase } from "metabase/permissions";
import type { CollectionPermissionsModalProps } from "metabase/plugins";
import { Modal } from "metabase/ui";

export function CollectionPermissionsModal({
  opened,
  collectionId,
  namespace,
  onClose,
}: CollectionPermissionsModalProps) {
  useListCollectionsQuery(
    namespace === "snippets" || namespace === "data-actions"
      ? { namespace }
      : skipToken,
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      withCloseButton={false}
      padding={0}
    >
      <CollectionPermissionsModalBase
        params={{ slug: String(collectionId) }}
        namespace={namespace ?? null}
        onClose={onClose}
      />
    </Modal>
  );
}
