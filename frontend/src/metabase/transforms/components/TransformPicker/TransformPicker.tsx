import { useMemo, useState } from "react";

import { useListTransformsQuery } from "metabase/api";
import {
  AutoScrollBox,
  ItemList,
  ListBox,
} from "metabase/common/components/EntityPicker";
import type {
  TransformPickerItem,
  TransformPickerProps,
} from "metabase/plugins";
import { Flex } from "metabase/ui";
import type { TransformId } from "metabase-types/api";

export function TransformPicker({ value, onItemSelect }: TransformPickerProps) {
  const [selectedTransformId, setSelectedTransformId] = useState(value?.id);
  const { data: transforms, error, isLoading } = useListTransformsQuery({});

  const items: TransformPickerItem[] | undefined = useMemo(() => {
    return transforms?.map((transform) => ({
      id: transform.id,
      model: "transform",
      name: transform.name,
    }));
  }, [transforms]);

  const selectedItem = useMemo(() => {
    return items?.find((item) => item.id === selectedTransformId) ?? null;
  }, [items, selectedTransformId]);

  const handleTransformClick = (item: TransformPickerItem) => {
    setSelectedTransformId(item.id);
    onItemSelect(item);
  };

  return (
    <AutoScrollBox
      contentHash={getContentHash(selectedTransformId)}
      data-testid="nested-item-picker"
    >
      <Flex h="100%" w="fit-content">
        <ListBox data-testid="item-picker-level-0">
          <ItemList
            items={items}
            selectedItem={selectedItem}
            error={error}
            isLoading={isLoading}
            isFolder={isFolder}
            isCurrentLevel
            onClick={handleTransformClick}
          />
        </ListBox>
      </Flex>
    </AutoScrollBox>
  );
}

function isFolder() {
  return false;
}

function getContentHash(selectedTransformId?: TransformId) {
  return selectedTransformId?.toString() ?? "";
}
