import React from "react";

import { List, WindowScroller, AutoSizer } from "react-virtualized";

const VirtualizedList = ({ items, rowHeight, renderItem }) => (
  <AutoSizer>
    {({ width }) => (
      <WindowScroller>
        {({ height, isScrolling, registerChild, scrollTop }) => (
          <List
            ref={registerChild}
            autoHeight
            width={width}
            height={Math.min(height, rowHeight * items.length)}
            isScrolling={isScrolling}
            rowCount={items.length}
            rowHeight={rowHeight}
            rowRenderer={({ index, key, style }) => (
              <div key={key} style={style}>
                {renderItem({ item: items[index], index })}
              </div>
            )}
            scrollTop={scrollTop}
          />
        )}
      </WindowScroller>
    )}
  </AutoSizer>
);

export default VirtualizedList;
