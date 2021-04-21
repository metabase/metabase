/* eslint-disable react/prop-types */
import React from "react";
import { List, WindowScroller, AutoSizer } from "react-virtualized";
import "react-virtualized/styles.css";

function VirtualizedList({ items, rowHeight, renderItem }) {
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
        <WindowScroller>
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
    [items, rowHeight, rowRenderer],
  );

  return <AutoSizer>{renderScrollComponent}</AutoSizer>;
}

export default VirtualizedList;
