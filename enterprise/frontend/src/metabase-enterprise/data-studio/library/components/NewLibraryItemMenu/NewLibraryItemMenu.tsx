import { t } from "ttag";

import { openNewCollectionModal } from "metabase/data-studio/common/utils";
import { useDispatch } from "metabase/redux";
import { Button, FixedSizeIcon, Icon, Menu } from "metabase/ui";
import type { CollectionId, CollectionNamespace } from "metabase-types/api";

import { LIBRARY_COLLECTION_PICKER_OPTIONS } from "../../constants";
import type { LibraryItemModel } from "../../types";
import { getLibraryItemSection } from "../../utils";

const LIBRARY_COLLECTION_NAMESPACES: CollectionNamespace[] = [null];

type NewLibraryItemMenuProps = {
  collectionId: CollectionId;
  model: LibraryItemModel;
  onNewItemClick: () => void;
};

export function NewLibraryItemMenu({
  collectionId,
  model,
  onNewItemClick,
}: NewLibraryItemMenuProps) {
  const dispatch = useDispatch();
  const section = getLibraryItemSection(model);

  const handleNewCollectionClick = () =>
    dispatch(
      openNewCollectionModal({
        initialCollectionId: collectionId,
        namespaces: LIBRARY_COLLECTION_NAMESPACES,
        pickerOptions: LIBRARY_COLLECTION_PICKER_OPTIONS,
      }),
    );

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button size="lg" leftSection={<Icon name="add" />}>{t`New`}</Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FixedSizeIcon name={section.icon} />}
          onClick={onNewItemClick}
        >
          {section.newItemLabel}
        </Menu.Item>
        <Menu.Item
          leftSection={<FixedSizeIcon name="folder" />}
          onClick={handleNewCollectionClick}
        >
          {t`Collection`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
