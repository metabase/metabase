/**
 * This component was actually copied from the kbar library, but
 * modified to remove virtualization of the list. This was due to virtualization
 * libraries not handling dynamically sized lists where the list changes from render to
 * render very well (it seemed to recompute when the list length changed, not the contents)
 *
 * Original can be found at https://github.com/timc1/kbar/blob/846b2c1a89f6cbff1ce947b82d04cb96a5066fbb/src/KBarResults.tsx
 */

import { useKBar, KBAR_LISTBOX, getListboxItemId } from "kbar";
import * as React from "react";

import type { PaletteActionImpl } from "../types";
import { navigateActionIndex } from "../utils";

const START_INDEX = 0;

interface RenderParams<T = PaletteActionImpl | string> {
  item: T;
  active: boolean;
}

interface PaletteResultListProps {
  items: (PaletteActionImpl | string)[];
  onRender: (params: RenderParams) => React.ReactElement;
  maxHeight?: number;
}

export const PaletteResultList: React.FC<PaletteResultListProps> = props => {
  const activeRef = React.useRef<HTMLDivElement>(null);
  const parentRef = React.useRef<HTMLDivElement>(null);

  // store a ref to all items so we do not have to pass
  // them as a dependency when setting up event listeners.
  const itemsRef = React.useRef(props.items);
  itemsRef.current = props.items;

  const { query, search, currentRootActionId, activeIndex, options } = useKBar(
    state => ({
      search: state.searchQuery,
      currentRootActionId: state.currentRootActionId,
      activeIndex: state.activeIndex,
    }),
  );

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing) {
        return;
      }

      if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
        event.preventDefault();
        event.stopPropagation();
        query.setActiveIndex(index => {
          return navigateActionIndex(itemsRef.current, index, -1);
        });
      } else if (
        event.key === "ArrowDown" ||
        (event.ctrlKey && event.key === "n")
      ) {
        event.preventDefault();
        event.stopPropagation();
        query.setActiveIndex(index => {
          return navigateActionIndex(itemsRef.current, index, 1);
        });
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        // storing the active dom element in a ref prevents us from
        // having to calculate the current action to perform based
        // on the `activeIndex`, which we would have needed to add
        // as part of the dependencies array.
        activeRef.current?.click();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, { capture: true });
  }, [query]);

  React.useEffect(() => {
    if (activeIndex > 1) {
      activeRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } else {
      parentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeIndex]);

  React.useEffect(() => {
    // TODO(tim): fix scenario where async actions load in
    // and active index is reset to the first item. i.e. when
    // users register actions and bust the `useRegisterActions`
    // cache, we won't want to reset their active index as they
    // are navigating the list.
    query.setActiveIndex(
      // avoid setting active index on a group
      typeof props.items[START_INDEX] === "string"
        ? START_INDEX + 1
        : START_INDEX,
    );
  }, [search, currentRootActionId, props.items, query]);

  const execute = React.useCallback(
    (item: RenderParams["item"]) => {
      if (typeof item === "string") {
        return;
      }
      if (item.command) {
        item.command.perform(item);
        query.toggle();
      } else {
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
        maxHeight: props.maxHeight || 400,
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
              onPointerMove: () =>
                activeIndex !== index && query.setActiveIndex(index),
              onPointerDown: () => query.setActiveIndex(index),
              onClick: () => execute(item),
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
              {React.cloneElement(
                props.onRender({
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
