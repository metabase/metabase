/* eslint-disable react/prop-types */
import React from "react";
import { List, WindowScroller, AutoSizer } from "react-virtualized";

function VirtualizedList({ items, rowHeight, renderItem, scrollElement }) {
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
        <WindowScroller scrollElement={scrollElement}>
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
