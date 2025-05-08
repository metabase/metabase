import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { type Ref, forwardRef, useRef } from "react";
import _ from "underscore";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon } from "metabase/ui";

import S from "./Item.module.css";
import {
  type Item,
  type ItemType,
  type TreePath,
  getIconForType,
  getUrl,
  hasChildren,
} from "./utils";

const ITEM_MIN_HEIGHT = 32;
const INDENT_LEVEL = 10;
const TYPE_TO_LEVEL = {
  database: 0,
  schema: INDENT_LEVEL,
  table: 2 * INDENT_LEVEL,
};

export function Results({
  items,
  toggle,
  path,
}: {
  items: (Item & { isExpanded?: boolean })[];
  toggle?: (key: string) => void;
  path: TreePath;
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
      <Box style={{ height: virtual.getTotalSize() }}>
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
                paddingLeft: TYPE_TO_LEVEL[item.type],
                left: "var(--mantine-spacing-xl)",
                right: "var(--mantine-spacing-xl)",
              }}
              active={item.type === "table" && _.isEqual(path, item.value)}
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
    active,
  }: {
    type: ItemType;
    onClick?: () => void;
    style?: any;
    isExpanded?: boolean;
    label: string;
    value: TreePath;
    active?: boolean;
  },
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Flex ref={ref} style={style}>
      <Link
        to={getUrl(value)}
        onClick={onClick}
        className={cx(S.item, S[type], { [S.active]: active })}
      >
        <Flex align="center" gap="xs" py="xs" mih={ITEM_MIN_HEIGHT}>
          {hasChildren(type) && (
            <Icon
              name="chevronright"
              size={10}
              color="var(--mb-color-text-light)"
              className={cx(S.chevron, { [S.expanded]: isExpanded })}
            />
          )}
          <Icon name={getIconForType(type)} className={S.icon} />
          <Box pl="sm">{label}</Box>
        </Flex>
      </Link>
    </Flex>
  );
});
