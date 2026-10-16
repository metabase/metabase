import cx from "classnames";
import { t } from "ttag";

import PinDropZone from "metabase/common/collections/components/PinDropZone";
import type { ItemRendererProps } from "metabase/common/components/ItemsTable/DefaultItemRenderer";
import CS from "metabase/css/core/index.css";
import visuallyHidden from "metabase/css/core/visually-hidden.module.css";
import { Flex } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";

import type { BaseItemsTableProps } from "./BaseItemsTable";
import { BaseItemsTable } from "./BaseItemsTable";
import S from "./ItemsTable.module.css";

const Item = ({
  item,
  ...props
}: {
  item: CollectionItem;
} & ItemRendererProps) => {
  return (
    <BaseItemsTable.Item
      key={`${item.model}-${item.id}`}
      {...props}
      item={item}
    />
  );
};

export const ItemsTable = ({
  items,
  ItemComponent = Item,
  skeleton = false,
  ...props
}: {
  items: CollectionItem[];
  ItemComponent?: (props: ItemRendererProps) => JSX.Element;
} & BaseItemsTableProps) => {
  if (items.length === 0 && !skeleton) {
    return (
      <Flex pos="relative" justify="center" align="center" m="lg" p="4rem">
        <PinDropZone variant="unpin" />
      </Flex>
    );
  }

  return (
    <div
      className={cx(CS.relative, S.container)}
      aria-busy={skeleton || undefined}
    >
      {skeleton && (
        <span role="status" className={visuallyHidden.visuallyHidden}>
          {t`Loading…`}
        </span>
      )}
      <PinDropZone variant="unpin" />
      <BaseItemsTable
        items={items}
        skeleton={skeleton}
        {...props}
        ItemComponent={ItemComponent}
      />
    </div>
  );
};
