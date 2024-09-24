/* eslint-disable react/prop-types */
import cx from "classnames";

import { useGetSnippetCollectionQuery } from "metabase/api/snippet-collection";
import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";
import type { CollectionId, CollectionItem, User } from "metabase-types/api";

import { CollectionOptionsButton } from "./CollectionOptionsButton";

const ICON_SIZE = 16;

type CollectionRowProps = {
  item: CollectionItem;
  setSnippetCollectionId: (id: CollectionId) => void;
  setSidebarState: (value: Record<string, unknown>) => void;
  user: User;
  className?: string;
};

export const CollectionRow = ({
  item,
  setSnippetCollectionId,
  setSidebarState,
  user,
  className,
}: CollectionRowProps) => {
  const { data: collection } = useGetSnippetCollectionQuery({
    id: item.id,
  });

  if (!collection) {
    return null;
  }

  const onSelectCollection = () => setSnippetCollectionId(collection.id);

  return (
    <div
      className={cx(
        { [cx(CS.bgLightHover, CS.cursorPointer)]: !collection.archived },
        CS.hoverParent,
        CS.hoverVisibility,
        CS.flex,
        CS.alignCenter,
        CS.py2,
        CS.px3,
        CS.textBrand,
      )}
      {...(collection.archived ? undefined : { onClick: onSelectCollection })}
    >
      <Icon name="folder" size={ICON_SIZE} style={{ opacity: 0.25 }} />
      <span className={cx(CS.flexFull, CS.ml1, CS.textBold)}>
        {collection.name}
      </span>
      <CollectionOptionsButton
        setSidebarState={setSidebarState}
        user={user}
        className={className}
        collection={collection}
      />
    </div>
  );
};
