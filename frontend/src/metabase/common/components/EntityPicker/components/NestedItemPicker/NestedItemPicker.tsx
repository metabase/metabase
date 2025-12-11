import ErrorBoundary from "metabase/ErrorBoundary";
import { CollectionItemPickerResolver } from "metabase/common/components/Pickers/CollectionPicker/components/CollectionItemPickerResolver";
import { Box, Flex } from "metabase/ui";

import { useOmniPickerContext } from "../../context";
import { AutoScrollBox } from "../AutoScrollBox";
import { RootItemList } from "../ItemList/RootItemList";

import S from "./NestedItemPicker.module.css";
import { generateKey } from "./utils";

export function NestedItemPicker() {
  const {
    path,
    isFolderItem,
  } = useOmniPickerContext();

  const folderPath = path.filter(isFolderItem);

  return (
    <div
      className={S.singlePickerView}
      data-testid="single-picker-view"
    >
      <AutoScrollBox
        data-testid="nested-item-picker"
        contentHash={generateKey(path?.[path.length - 1])}
      >
        <Flex h="100%" w="fit-content">
          <Box
            className={S.ListBox}
            data-testid={`item-picker-level-root`}
          >
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
                  <CollectionItemPickerResolver
                    parentItem={item}
                    pathIndex={index}
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
