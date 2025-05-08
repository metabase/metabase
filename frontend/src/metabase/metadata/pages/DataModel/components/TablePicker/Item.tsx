import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { useRef } from "react";
import _ from "underscore";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon } from "metabase/ui";

import S from "./Item.module.css";
import type { Item, TreePath } from "./types";
import { getIconForType, getUrl, hasChildren } from "./utils";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 32;
const INDENT_LEVEL = 10;

const itemPadding = {
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
    overscan: VIRTUAL_OVERSCAN,
  });

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((virtualItem) => {
          const { value, label, type, isExpanded, key } =
            items[virtualItem.index];
          return (
            <Flex
              key={key}
              ref={virtual.measureElement}
              style={{
                position: "absolute",
                top: virtualItem.start,
                paddingLeft: itemPadding[type],
                left: "var(--mantine-spacing-xl)",
                right: "var(--mantine-spacing-xl)",
              }}
            >
              <Link
                to={getUrl(value)}
                onClick={() => {
                  toggle?.(key);
                  virtual.measure();
                }}
                className={cx(S.item, S[type], {
                  [S.active]: type === "table" && _.isEqual(path, value),
                })}
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
        })}
      </Box>
    </Box>
  );
}
