import {
  List,
  AutoSizer,
  CellMeasurer,
  CellMeasurerCache,
} from "react-virtualized";
import { Text, Box, NavLink } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { SearchResult } from "metabase-types/api";
import { getIcon, isSelectedItem } from "../../utils";
import { PickerColumn } from "./ItemList.styled";

export const ItemList = ({
  items,
  onClick,
  selectedItem,
  folderModel,
}: {
  items: SearchResult[];
  onClick: (item: SearchResult) => void;
  selectedItem: SearchResult | null;
  folderModel: string;
}) => {
  const cache = new CellMeasurerCache({
    defaultHeight: 40,
    fixedWidth: true,
  });

  if (!items) {
    return null;
  }

  if (!items.length) {
    return (
      <Box miw={310}>
        <Text align="center" p="lg">
          No items
        </Text>
      </Box>
    );
  }

  return (
    <PickerColumn>
      <AutoSizer>
        {({ height, width }) => (
          <List
            height={height}
            width={width}
            rowHeight={cache.rowHeight}
            items={items}
            rowCount={items.length}
            rowRenderer={({ index, key, style, parent }) => {
              const item = items[index];
              const isFolder = folderModel.includes(item.model);
              const isSelected = isSelectedItem(item, selectedItem);
              return (
                <CellMeasurer
                  key={key}
                  cache={cache}
                  columnCount={1}
                  columnIndex={0}
                  parent={parent}
                  rowIndex={index}
                >
                  {({ registerChild }) => (
                    <div ref={registerChild} style={style}>
                      <NavLink
                        rightSection={
                          isFolder ? (
                            <Icon name="chevronright" size={10} />
                          ) : null
                        }
                        label={item.name}
                        active={isSelected}
                        icon={
                          <Icon name={isFolder ? "folder" : getIcon(item)} />
                        }
                        onClick={e => {
                          e.preventDefault(); // prevent form submission
                          e.stopPropagation(); // prevent parent onClick
                          onClick(item);
                        }}
                        variant="light"
                        mb="xs"
                      />
                    </div>
                  )}
                </CellMeasurer>
              );
            }}
          />
        )}
      </AutoSizer>
    </PickerColumn>
  );
};
