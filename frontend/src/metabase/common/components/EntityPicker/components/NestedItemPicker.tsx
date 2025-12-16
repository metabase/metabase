import ErrorBoundary from "metabase/ErrorBoundary";
import { Box, Flex } from "metabase/ui";

import { useOmniPickerContext } from "../context";
import { useSwitchToSearchFolder } from "../hooks/use-switch-to-search-folder";
import { AutoScrollBox } from "./AutoScrollBox";
import { ItemListRouter } from "./ItemLists/ItemListRouter";
import { RootItemList } from "./ItemLists/RootItemList";
import { generateKey } from "./utils";

import S from "./NestedItemPicker.module.css";

export function NestedItemPicker() {
  const { path, isFolderItem } = useOmniPickerContext();

  const folderPath = path.filter(isFolderItem);
  useSwitchToSearchFolder();

  return (
    <div className={S.singlePickerView} data-testid="single-picker-view">
      <AutoScrollBox
        data-testid="nested-item-picker"
        contentHash={generateKey(path?.[path.length - 1])}
      >
        <Flex h="100%" w="fit-content">
          <Box className={S.ListBox} data-testid={`item-picker-level-root`}>
            <RootItemList />
          </Box>
          {folderPath.map((item, index) => {
            return (
              <Box
                className={S.ListBox}
                data-testid={`item-picker-level-root`}
                key={generateKey(item)}
              >
                <ErrorBoundary>
                  <ItemListRouter parentItem={item} pathIndex={index} />
                </ErrorBoundary>
              </Box>
            );
          })}
        </Flex>
      </AutoScrollBox>
    </div>
  );
}
