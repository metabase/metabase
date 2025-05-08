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
const INDENT_LEVEL = 10;

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

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map(({ start, index }) => {
          const { value, label, type, isExpanded, isLoading, key } =
            items[index];
          const isActive = type === "table" && _.isEqual(path, value);

          return (
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
                        className={cx(S.chevron, { [S.expanded]: isExpanded })}
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
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (delay === 0) {
      setShow(true);
      return;
    }
    const timeout = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  if (!show) {
    // make tests aware that things are loading
    return <span data-testid="loading-indicator" />;
  }

  return children;
}

function Loading() {
  const w = 20 + Math.random() * 80;
  return <Skeleton radius="sm" width={`${w}%`} height={12} />;
}
