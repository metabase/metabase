import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";
import _ from "underscore";

import Link from "metabase/core/components/Link";
import { Box, Flex, Icon, Skeleton } from "metabase/ui";

import S from "./Results.module.css";
import type { FlatItem, TreePath } from "./types";
import { getIconForType, getUrl, hasChildren } from "./utils";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 32;
const INDENT_LEVEL = 18;

const itemMargin = {
  database: 0,
  schema: INDENT_LEVEL,
  table: INDENT_LEVEL * 2,
};

export function Results({
  items,
  toggle,
  path,
}: {
  items: FlatItem[];
  toggle?: (key: string) => void;
  path: TreePath;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: VIRTUAL_OVERSCAN,
    estimateSize: () => ITEM_MIN_HEIGHT,
  });

  const virtualItems = virtual.getVirtualItems();

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtualItems.map(({ start, size, index }) => {
          const item = items[index];
          const { value, label, type, isExpanded, isLoading, key } = item;
          const isActive = type === "table" && _.isEqual(path, value);

          const parentIndex = items.findIndex(findParentFor(item));
          const parent = virtualItems.find(
            (item) => item.index === parentIndex,
          );

          return (
            <>
              {type !== "database" && parent && (
                <Track
                  start={parent.start + 0.5 * parent.size}
                  end={start + 0.5 * size}
                  type={type}
                />
              )}
              <Flex
                key={key}
                ref={virtual.measureElement}
                className={cx(S.item, S[type], { [S.active]: isActive })}
                data-index={index}
                style={{
                  top: start,
                  marginLeft: itemMargin[type],
                }}
              >
                <MaybeLink
                  className={S.link}
                  to={value ? getUrl(value) : undefined}
                  onClick={() => {
                    toggle?.(key);
                    virtual.measureElement(
                      ref.current?.querySelector(`[data-index='${index}']`),
                    );
                  }}
                >
                  <Flex align="center" gap="xs" py="xs" mih={ITEM_MIN_HEIGHT}>
                    <Delay delay={isLoading ? 200 : 0}>
                      {hasChildren(type) && (
                        <Icon
                          name="chevronright"
                          size={10}
                          color="var(--mb-color-text-light)"
                          className={cx(S.chevron, {
                            [S.expanded]: isExpanded,
                          })}
                        />
                      )}
                      <Icon name={getIconForType(type)} className={S.icon} />
                      {isLoading ? (
                        <Loading />
                      ) : (
                        <Box pl="sm" className={S.label}>
                          {label}
                        </Box>
                      )}
                    </Delay>
                  </Flex>
                </MaybeLink>
              </Flex>
            </>
          );
        })}
      </Box>
    </Box>
  );
}

function MaybeLink(props: {
  to?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (props.to !== undefined) {
    return <Link {...props} to={props.to} />;
  }
  return <span {...props} />;
}

function Delay({ delay, children }: { delay: number; children: ReactNode }) {
  const [show, setShow] = useState(delay === 0);

  useEffect(() => {
    if (delay > 0) {
      const timeout = setTimeout(() => setShow(true), delay);
      return () => clearTimeout(timeout);
    }
    setShow(true);
  }, [delay]);

  return show ? children : null;
}

function Loading() {
  const w = 20 + Math.random() * 80;
  return <Skeleton radius="sm" width={`${w}%`} height={12} />;
}

function Track({
  type,
  start,
  end,
}: {
  type: FlatItem["type"];
  start: number;
  end: number;
}) {
  const LEFT = 18;
  const TOP = 20;

  const top = start + TOP;

  return (
    <div
      className={S.track}
      style={{
        top,
        height: end - top,
        left: LEFT + itemMargin[type],
      }}
    />
  );
}

function findParentFor({ type, value }: FlatItem) {
  return (item: FlatItem) => {
    if (type === "database") {
      return null;
    }
    if (type === "schema") {
      return (
        item.type === "database" && item.value?.databaseId === value?.databaseId
      );
    }
    if (type === "table") {
      return (
        item.type === "schema" &&
        item.value?.databaseId === value?.databaseId &&
        item.value?.schemaId === value?.schemaId
      );
    }
  };
}
