import { useMemo, useState } from "react";

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
import { useListTransformsQuery } from "metabase-enterprise/api";
import type { Transform, TransformId } from "metabase-types/api";

export function TransformPicker({ value, onItemSelect }: TransformPickerProps) {
  const [selectedTransformId, setSelectedTransformId] = useState(value?.id);
  const { data: transforms, error, isLoading } = useListTransformsQuery({});

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
        <TransformList
          transforms={transforms}
          error={error}
          isLoading={isLoading}
          selectedTransformId={selectedTransformId}
          onClick={handleTransformClick}
        />
      </Flex>
    </AutoScrollBox>
  );
}

function getContentHash(selectedTransformId?: TransformId) {
  return selectedTransformId?.toString() ?? "";
}

type TransformListProps = {
  transforms: Transform[] | undefined;
  error: unknown;
  isLoading: boolean;
  selectedTransformId: TransformId | undefined;
  onClick: (item: TransformPickerItem) => void;
};

const isFolder = () => false;

function TransformList({
  transforms,
  error,
  isLoading,
  selectedTransformId,
  onClick,
}: TransformListProps) {
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

  return (
    <ListBox data-testid="item-picker-level-2">
      <ItemList
        items={items}
        selectedItem={selectedItem}
        error={error}
        isLoading={isLoading}
        isFolder={isFolder}
        isCurrentLevel
        onClick={onClick}
      />
    </ListBox>
  );
}
