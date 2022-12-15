import React from "react";
import { List, WindowScroller, AutoSizer } from "react-virtualized";

interface VirtualizedListProps<Item = unknown>
  extends React.HTMLProps<HTMLUListElement> {
  items: Item[];
  rowHeight: number;
  renderItem: (props: { item: Item; index: number }) => React.ReactNode;
  scrollElement?: HTMLElement | null;
}

function VirtualizedList<Item>({
  items,
  rowHeight,
  renderItem,
  scrollElement,
}: VirtualizedListProps<Item>) {
  const rowRenderer = React.useCallback(
    ({ index, key, style }) => (
      <div key={key} style={style}>
        {renderItem({ item: items[index], index })}
      </div>
    ),
    [items, renderItem],
  );

  const renderScrollComponent = React.useCallback(
    ({ width }) => {
      return (
        <WindowScroller scrollElement={scrollElement || undefined}>
          {({ height, isScrolling, scrollTop }) => (
            <List
              autoHeight
              width={width}
              height={Math.min(height, rowHeight * items.length)}
              isScrolling={isScrolling}
              rowCount={items.length}
              rowHeight={rowHeight}
              rowRenderer={rowRenderer}
              scrollTop={scrollTop}
            />
          )}
        </WindowScroller>
      );
    },
    [items, rowHeight, rowRenderer, scrollElement],
  );

  return <AutoSizer>{renderScrollComponent}</AutoSizer>;
}

export default VirtualizedList;
