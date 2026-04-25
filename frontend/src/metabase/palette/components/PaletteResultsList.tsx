/**
 * This component was actually copied from the kbar library, but
 * modified to remove virtualization of the list. This was due to virtualization
 * libraries not handling dynamically sized lists where the list changes from render to
 * render very well (it seemed to recompute when the list length changed, not the contents)
 *
 * Original can be found at https://github.com/timc1/kbar/blob/846b2c1a89f6cbff1ce947b82d04cb96a5066fbb/src/KBarResults.tsx
 */

import { KBAR_LISTBOX, getListboxItemId, useKBar } from "kbar";
import {
  type MouseEvent,
  cloneElement,
  useCallback,
  useEffect,
  useRef,
} from "react";

import type { PaletteActionImpl } from "../types";
import { navigateActionIndex } from "../utils";

const START_INDEX = 0;

interface RenderParams<T = PaletteActionImpl | string> {
  item: T;
  active: boolean;
}

interface PaletteResultListProps {
  items: (PaletteActionImpl | string)[];
  renderItem: (params: RenderParams) => React.ReactElement;
  maxHeight: number;
  minHeight: number;
}

export const PaletteResultList = (props: PaletteResultListProps) => {
  const activeRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // store a ref to all items so we do not have to pass
  // them as a dependency when setting up event listeners.
  const itemsRef = useRef(props.items);
  itemsRef.current = props.items;

  const hasUserInteractedRef = useRef(false);

  const { query, search, currentRootActionId, activeIndex, options } = useKBar(
    (state) => ({
      search: state.searchQuery,
      currentRootActionId: state.currentRootActionId,
      activeIndex: state.activeIndex,
    }),
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }
      if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
        event.preventDefault();
        event.stopPropagation();
        hasUserInteractedRef.current = true;
        query.setActiveIndex((index) => {
          return navigateActionIndex(itemsRef.current, index, -1);
        });
      } else if (
        event.key === "ArrowDown" ||
        (event.ctrlKey && event.key === "n")
      ) {
        event.preventDefault();
        event.stopPropagation();
        hasUserInteractedRef.current = true;
        query.setActiveIndex((index) => {
          return navigateActionIndex(itemsRef.current, index, 1);
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        // storing the active dom element in a ref prevents us from
        // having to calculate the current action to perform based
        // on the `activeIndex`, which we would have needed to add
        // as part of the dependencies array.

        //If we have a link for a child, then click that instead
        const childAnchor = activeRef.current?.querySelector("a");

        const target = childAnchor || activeRef?.current;

        if (!target) {
          return;
        } else if (event.ctrlKey || event.metaKey) {
          target.dispatchEvent(
            new MouseEvent("click", {
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
            }),
          );
        } else {
          target.click();
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [query]);

  useEffect(() => {
    if (activeIndex > 1) {
      activeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } else {
      parentRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
    }
  }, [activeIndex]);

  // Reset interaction tracking when search changes
  useEffect(() => {
    hasUserInteractedRef.current = false;
  }, [search]);

  useEffect(() => {
    // Only auto-set the active index if the user hasn't interacted yet.
    // This prevents resetting their selection when async search results load in.
    if (!hasUserInteractedRef.current) {
      query.setActiveIndex(
        // avoid setting active index on a group
        typeof props.items[START_INDEX] === "string"
          ? START_INDEX + 1
          : START_INDEX,
      );
    }
  }, [search, currentRootActionId, props.items, query]);

  const execute = useCallback(
    (item: RenderParams["item"], e?: MouseEvent) => {
      if (typeof item === "string") {
        return;
      }
      if (item.command) {
        item.command.perform();
        if (!(e?.metaKey === true || e?.ctrlKey === true)) {
          query.toggle();
        }
      } else if (!item.extra?.href) {
        query.setSearch("");
        query.setCurrentRootAction(item.id);
      }
      options.callbacks?.onSelectAction?.(item);
    },
    [query, options],
  );

  return (
    <div
      ref={parentRef}
      style={{
        maxHeight: props.maxHeight,
        minHeight: props.minHeight,
        overflow: "auto",
      }}
    >
      <div
        role="listbox"
        id={KBAR_LISTBOX}
        style={{
          position: "relative",
          width: "100%",
        }}
      >
        {props.items.map((item, index) => {
          const handlers = typeof item !== "string" &&
            item.disabled !== true && {
              onPointerMove: () => {
                if (activeIndex !== index) {
                  hasUserInteractedRef.current = true;
                  query.setActiveIndex(index);
                }
              },
              onPointerDown: () => {
                hasUserInteractedRef.current = true;
                query.setActiveIndex(index);
              },
              onClick: (e: MouseEvent) => execute(item, e),
            };
          const active = index === activeIndex;

          return (
            <div
              ref={active ? activeRef : null}
              id={getListboxItemId(index)}
              role="option"
              aria-selected={active}
              key={typeof item === "string" ? item : item.id}
              {...handlers}
            >
              {cloneElement(
                props.renderItem({
                  item,
                  active,
                }),
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
