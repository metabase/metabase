import { useVirtualizer } from "@tanstack/react-virtual";
import cx from "classnames";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Box } from "metabase/ui";

import { TreeItem } from "../../../../components/TreePicker/TreeItem";
import { getUrl } from "../../utils";

import { BulkTableVisibilityToggle } from "./BulkTableVisibilityToggle";
import S from "./Results.module.css";
import { TableVisibilityToggle } from "./TableVisibilityToggle";
import type { FlatItem, TreePath } from "./types";
import { TYPE_ICONS, hasChildren } from "./utils";

const VIRTUAL_OVERSCAN = 5;
const ITEM_MIN_HEIGHT = 32; // items can vary in size because of text wrapping
const INDENT_OFFSET = 18;

interface Props {
  items: FlatItem[];
  path: TreePath;
  reload?: (path: TreePath) => void;
  selectedIndex?: number;
  toggle?: (key: string, value?: boolean) => void;
  withMassToggle?: boolean;
  onItemClick?: (path: TreePath) => void;
  onSelectedIndexChange?: (index: number) => void;
}

export function Results({
  items,
  path,
  reload,
  selectedIndex,
  toggle,
  withMassToggle,
  onItemClick,
  onSelectedIndexChange,
}: Props) {
  const [activeTableId, setActiveTableId] = useState(path.tableId);
  const ref = useRef<HTMLDivElement>(null);

  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => ref.current,
    overscan: VIRTUAL_OVERSCAN,
    estimateSize: () => ITEM_MIN_HEIGHT,
  });

  const virtualItems = virtual.getVirtualItems();

  useEffect(
    function scrollActiveTableIntoView() {
      if (path.tableId === undefined) {
        return;
      }
      const index = items.findIndex(
        (item) => item.type === "table" && item.value?.tableId === path.tableId,
      );
      if (index === -1) {
        return;
      }

      virtual.scrollToIndex(index);
    },
    [path.tableId, items, virtual],
  );

  useEffect(
    function measureItemsWhenTheyChange() {
      const { startIndex = 0, endIndex = 0 } = virtual.range ?? {};
      for (let idx = startIndex; idx <= endIndex; idx++) {
        virtual.measureElement(
          ref.current?.querySelector(`[data-index='${idx}']`),
        );
      }
    },
    [items, virtual],
  );

  useEffect(() => {
    // sync the selected index by focusing the corresponding item,
    // but only when the user is not currently typing in the search input
    if (document.activeElement?.tagName !== "INPUT") {
      document
        .querySelector<HTMLAnchorElement>(`[data-index='${selectedIndex}']`)
        ?.focus();
    }
  }, [selectedIndex]);

  return (
    <Box ref={ref} px="xl" pb="lg" className={S.results}>
      <Box style={{ height: virtual.getTotalSize() }}>
        {virtualItems.map(({ start, index }) => {
          const item = items[index];
          const {
            value,
            label,
            type,
            isExpanded,
            isLoading,
            key,
            level,
            parent,
            disabled,
          } = item;
          const isActive = type === "table" && value?.tableId === activeTableId;
          const parentIndex = items.findIndex((item) => item.key === parent);
          const children = items.filter((item) => item.parent === key);
          const hasTableChildren = children.some(
            (child) => child.type === "table",
          );

          const handleItemSelect = (open?: boolean) => {
            if (disabled) {
              return;
            }

            toggle?.(key, open);

            if (value && (!isExpanded || type === "table")) {
              onItemClick?.(value);
            }

            if (type === "table") {
              setActiveTableId(value?.tableId);
            }
          };

          function itemByIndex(index: number) {
            return ref.current?.querySelector<HTMLAnchorElement>(
              `[data-index='${index}']`,
            );
          }

          const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
            if (typeof selectedIndex === "number") {
              // If there is a selected index externally
              // don't handle the key events
              return;
            }
            if (event.code === "ArrowDown") {
              // focus the next item in the list
              // does not wrap at around
              itemByIndex(index + 1)?.focus();
              event.preventDefault();
            }
            if (event.code === "ArrowUp") {
              // focus the previous item in the list
              // does not wrap at around
              itemByIndex(index - 1)?.focus();
              event.preventDefault();
            }
            if (event.code === "ArrowLeft") {
              if (isExpanded && type !== "table") {
                // when expanded, close the item
                toggle?.(key, false);
              } else {
                // when already closed, go to parent node
                itemByIndex(parentIndex)?.focus();
              }
              event.preventDefault();
            }
            if (event.code === "ArrowRight") {
              if (!isExpanded) {
                // expand the item
                if (type !== "table") {
                  handleItemSelect(true);
                }
              } else {
                // go to first child
                itemByIndex(index + 1)?.focus();
              }
              event.preventDefault();
            }

            if (
              !disabled &&
              (event.code === "Space" || event.code === "Enter")
            ) {
              // toggle the current item
              handleItemSelect();
              event.preventDefault();
            }
          };

          return (
            <TreeItem
              key={key}
              className={S.item}
              label={label}
              icon={TYPE_ICONS[type]}
              href={getUrl({
                databaseId: value?.databaseId,
                schemaName:
                  type === "schema" || type === "table"
                    ? value?.schemaName
                    : undefined,
                tableId: type === "table" ? value?.tableId : undefined,
                fieldId: undefined,
              })}
              isActive={isActive}
              isSelected={index === selectedIndex}
              isExpanded={isExpanded}
              isExpandable={hasChildren(type)}
              isLoading={isLoading}
              isHidden={
                type === "table" &&
                item.table &&
                item.table.visibility_type != null
              }
              isDisabled={disabled}
              style={{
                top: start,
                marginLeft: level * INDENT_OFFSET,
              }}
              data-type={type}
              data-index={index}
              onKeyDown={handleKeyDown}
              onClick={(event) => {
                event.preventDefault();
                handleItemSelect();
              }}
              onFocus={() => onSelectedIndexChange?.(index)}
            >
              {withMassToggle &&
                type === "database" &&
                value?.databaseId !== undefined &&
                hasTableChildren &&
                !disabled && (
                  <BulkTableVisibilityToggle
                    className={S.massVisibilityToggle}
                    tables={children.flatMap((child) =>
                      child.type === "table" && child.table != null
                        ? [child.table]
                        : [],
                    )}
                    onUpdate={() => reload?.(value)}
                  />
                )}

              {withMassToggle &&
                type === "schema" &&
                value?.schemaName !== undefined &&
                hasTableChildren &&
                !disabled && (
                  <BulkTableVisibilityToggle
                    className={S.massVisibilityToggle}
                    tables={children.flatMap((child) =>
                      child.type === "table" && child.table != null
                        ? [child.table]
                        : [],
                    )}
                    onUpdate={() => reload?.(value)}
                  />
                )}

              {type === "table" &&
                value?.tableId !== undefined &&
                item.table &&
                !disabled && (
                  <TableVisibilityToggle
                    className={cx(S.visibilityToggle, {
                      [S.hidden]: item.table.visibility_type == null,
                    })}
                    table={item.table}
                    onUpdate={() => reload?.(value)}
                  />
                )}
            </TreeItem>
          );
        })}
      </Box>
    </Box>
  );
}
