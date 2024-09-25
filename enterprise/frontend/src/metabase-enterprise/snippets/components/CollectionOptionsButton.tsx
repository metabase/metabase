import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import AccordionList from "metabase/core/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type {
  Collection,
  CollectionId,
  RegularCollectionId,
  User,
} from "metabase-types/api";

const ICON_SIZE = 16;

type CollectionOptionsButtonProps = {
  collection: Collection;
  user: User;
  className?: string;
  setPermissionsModalCollectionId?: (c: CollectionId | null) => void;
  setModalSnippetCollection?: (c: Collection | null) => void;
};

const isRegularCollectionId = (id: CollectionId): id is RegularCollectionId => {
  return typeof id === "number";
};

export const CollectionOptionsButton = ({
  collection,
  setPermissionsModalCollectionId,
  setModalSnippetCollection,
  user,
  className,
}: CollectionOptionsButtonProps) => {
  const [archiveCollection] = useUpdateCollectionMutation();

  const setArchived = useCallback(
    (archived: boolean) => {
      if (isRegularCollectionId(collection.id)) {
        archiveCollection({
          id: collection.id,
          archived,
        });
      }
    },
    [archiveCollection, collection.id],
  );

  const popoverOptions = useMemo(() => {
    if (!collection.can_write) {
      return [];
    }
    if (collection.archived) {
      return [
        {
          name: t`Unarchive`,
          onClick: () => setArchived(false),
        },
      ];
    }
    const onEdit = (collection: Collection) =>
      setModalSnippetCollection?.(collection);
    const onEditCollectionPermissions = () =>
      setPermissionsModalCollectionId?.(collection.id);

    const options = [];
    const isRoot = canonicalCollectionId(collection.id) === null;
    if (!isRoot) {
      options.push({
        name: t`Edit folder details`,
        onClick: () => onEdit(collection),
      });
    }
    if (user && user.is_superuser) {
      options.push({
        name: t`Change permissions`,
        onClick: onEditCollectionPermissions,
      });
    }
    if (!isRoot) {
      options.push({
        name: t`Archive`,
        onClick: () => setArchived(true),
      });
    }
    return options;
  }, [
    collection,
    setArchived,
    setModalSnippetCollection,
    setPermissionsModalCollectionId,
    user,
  ]);

  if (popoverOptions.length === 0) {
    return null;
  }

  return (
    <div
      className={className}
      // prevent the ellipsis click from selecting the folder also
      onClick={e => e.stopPropagation()}
      // cap the large ellipsis so it doesn't increase the row height
      style={{ height: ICON_SIZE }}
    >
      <TippyPopoverWithTrigger
        triggerClasses={CS.hoverChild}
        triggerContent={<Icon name="ellipsis" size={20} />}
        placement="bottom-end"
        popoverContent={({ closePopover }) => (
          <AccordionList
            className={CS.textBrand}
            sections={[{ items: popoverOptions }]}
            onChange={(item: any) => {
              item.onClick(item);
              closePopover();
            }}
          />
        )}
      />
    </div>
  );
};
