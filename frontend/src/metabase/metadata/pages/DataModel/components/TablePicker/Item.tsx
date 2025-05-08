import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { type Ref, forwardRef, useRef } from "react";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon } from "metabase/ui";

import { getUrl } from "../../utils";

import S from "./Item.module.css";
import {
  type Item,
  type ItemType,
  type TreePath,
  getIconForType,
  hasChildren,
} from "./utils";

const ITEM_MIN_HEIGHT = 32;
const INDENT_LEVEL = 16;
const TYPE_TO_LEVEL = {
  database: 0,
  schema: 1,
  table: 2,
};

export function Results({
  items,
  toggle,
}: {
  items: (Item & { isExpanded?: boolean })[];
  toggle?: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const virtual = useVirtualizer({
    estimateSize: () => ITEM_MIN_HEIGHT,
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: 5,
  });

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box
        style={{
          height: virtual.getTotalSize(),
        }}
      >
        {virtual.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          return (
            <ItemRow
              {...item}
              key={item.key}
              ref={virtual.measureElement}
              onClick={() => {
                toggle?.(item.key);
                virtual.measure();
              }}
              style={{
                position: "absolute",
                top: virtualItem.start,
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
}

const ItemRow = forwardRef(function ItemRowInner(
  {
    type,
    onClick,
    style,
    label,
    isExpanded,
    value,
  }: {
    type: ItemType;
    onClick?: () => void;
    style?: any;
    isExpanded?: boolean;
    label: string;
    value: TreePath;
  },
  ref: Ref<HTMLDivElement>,
) {
  const level = TYPE_TO_LEVEL[type];
  return (
    <Box
      ref={ref}
      mih={ITEM_MIN_HEIGHT}
      style={{
        ...style,
        marginLeft: level * INDENT_LEVEL,
      }}
    >
      <Link
        to={getUrl({
          databaseId: undefined,
          fieldId: undefined,
          schemaId: undefined,
          tableId: undefined,
          ...value,
        })}
        onClick={onClick}
      >
        <Flex align="center" gap="sm" direction="row" my="xs">
          {hasChildren(type) ? (
            <Icon
              name="chevronright"
              size={10}
              color="var(--mb-color-text-light)"
              className={cx(S.chevron, {
                [S.expanded]: isExpanded,
              })}
            />
          ) : null}
          <Icon name={getIconForType(type)} />
          {label}
        </Flex>
      </Link>
    </Box>
  );
});
