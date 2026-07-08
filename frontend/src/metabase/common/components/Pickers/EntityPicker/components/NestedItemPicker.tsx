import ErrorBoundary from "metabase/ErrorBoundary";
import { Box, Flex } from "metabase/ui";

import { useOmniPickerContext } from "../context";
import { useSwitchToSearchFolder } from "../hooks/use-switch-to-search-folder";

import { AutoScrollBox } from "./AutoScrollBox";
import { ItemListRouter } from "./ItemLists/ItemListRouter";
import { RootItemList } from "./ItemLists/RootItemList";
import S from "./NestedItemPicker.module.css";
import { generateKey } from "./utils";

export function NestedItemPicker() {
  const { path, isLoadingPath, isFolderItem } = useOmniPickerContext();
  const folderPath = path.filter(isFolderItem);
  useSwitchToSearchFolder();

  return (
    <div className={S.singlePickerView} data-testid="single-picker-view">
      <AutoScrollBox
        data-testid="nested-item-picker"
        contentHash={generateKey(path?.[path.length - 1])}
      >
        <Flex h="100%" w="fit-content">
          <Box className={S.ListBox} data-testid={`item-picker-level-0`}>
            <RootItemList isLoading={isLoadingPath} />
          </Box>
          {folderPath.map((item, index) => {
            return (
              <Box
                className={S.ListBox}
                data-testid={`item-picker-level-${index + 1}`}
                key={generateKey(item)}
              >
                <ErrorBoundary>
                  <ItemListRouter
                    parentItem={item}
                    pathIndex={index}
                    isLoading={isLoadingPath}
                  />
                </ErrorBoundary>
              </Box>
            );
          })}
        </Flex>
      </AutoScrollBox>
    </div>
  );
}
