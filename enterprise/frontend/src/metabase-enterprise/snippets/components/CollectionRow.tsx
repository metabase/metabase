import cx from "classnames";

import { CollectionRowMenu } from "metabase/common/collections/components/CollectionRowMenu";
import CS from "metabase/css/core/index.css";
import { Ellipsified, Icon } from "metabase/ui";
import type { Collection, CollectionId } from "metabase-types/api";

const ICON_SIZE = 16;

interface CollectionRowProps {
  item: Collection;
  setSnippetCollectionId?: (id: CollectionId) => void;
}

export function CollectionRow({
  item: collection,
  setSnippetCollectionId,
}: CollectionRowProps) {
  const onSelectCollection = () => {
    setSnippetCollectionId?.(collection.id);
  };

  return (
    <div
      className={cx(
        { [cx(CS.bgLightHover, CS.cursorPointer)]: !collection.archived },
        CS.hoverParent,
        CS.hoverVisibility,
        CS.flex,
        CS.alignCenter,
        CS.py1,
        CS.px3,
        CS.textBrand,
      )}
      {...(collection.archived ? undefined : { onClick: onSelectCollection })}
    >
      <Icon
        name="folder"
        size={ICON_SIZE}
        style={{ opacity: 0.25 }}
        className={CS.flexNoShrink}
      />
      <Ellipsified className={cx(CS.flexFull, CS.ml1, CS.textBold)} flex={1}>
        {collection.name}
      </Ellipsified>
      <CollectionRowMenu collection={collection} />
    </div>
  );
}
