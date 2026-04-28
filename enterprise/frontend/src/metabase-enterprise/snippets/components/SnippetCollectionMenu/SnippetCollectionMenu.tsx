import { useDisclosure } from "@mantine/hooks";

import { CollectionRowMenu } from "metabase/collections/components/CollectionRowMenu";
import type { SnippetCollectionMenuProps } from "metabase/plugins/oss/snippets";

import { SnippetCollectionPermissionsModal } from "../SnippetCollectionPermissionsModal";

export function SnippetCollectionMenu(props: SnippetCollectionMenuProps) {
  const { collection } = props;
  const [showPermissionsModal, { toggle: togglePermissionsModal }] =
    useDisclosure(false);

  return (
    <>
      <CollectionRowMenu
        collection={collection}
        onChangePermissions={togglePermissionsModal}
      />
      {showPermissionsModal && (
        <SnippetCollectionPermissionsModal
          collectionId={collection.id}
          onClose={togglePermissionsModal}
        />
      )}
    </>
  );
}
