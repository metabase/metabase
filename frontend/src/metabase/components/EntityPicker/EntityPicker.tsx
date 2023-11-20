import { useState } from "react";

import { Modal, Flex, Button, Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";

interface EntityPickerProps {
  onFolderSelect: (folder?: any) => Promise<any[]>;
  onItemSelect: (item: any) => void;
  folderModel: string;
  itemModel: string;
  initialState?: any[];
}

export function EntityPicker({
  onFolderSelect,
  onItemSelect,
  folderModel,
  itemModel,
  initialState = [],
}: EntityPickerProps) {
  const [stack, setStack] = useState<
    {
      items: any[];
      selectedId: any;
    }[]
  >(initialState);

  const handleFolderSelect = async (folder: any, levelIndex: number) => {
    const children = await onFolderSelect(folder);

    // FIXME do better
    const restOfStack = stack.slice(0, levelIndex + 1);
    restOfStack[restOfStack.length - 1].selectedId = folder.id;

    setStack([...restOfStack, { items: children, selectedId: null }]);
  };

  const handleItemSelect = (item: any) => {
    onItemSelect(item);
  };

  const handleClick = (item: any, levelIndex: number) => {
    if (folderModel.includes(item.model)) {
      handleFolderSelect(item, levelIndex);
    } else if (item.model === itemModel) {
      handleItemSelect(item);
    }
  };

  return (
    <Modal title="Entity Picker" opened onClose={() => null} size="xl">
      <Flex gap="lg">
        {stack.map((level, levelIndex) => (
          <ItemList
            // key={levelIndex} // FIXME: bad
            items={level.items}
            onClick={item => handleClick(item, levelIndex)}
            selectedId={level.selectedId}
            folderModel={folderModel}
          />
        ))}
      </Flex>
    </Modal>
  );
}

function ItemList({
  items,
  onClick,
  selectedId,
  folderModel,
}: {
  items: any[];
  onClick: (item: any) => void;
  selectedId: number;
  folderModel: string;
}) {
  if (!items) {
    return null;
  }

  return (
    <div>
      {items.map(item => {
        const isFolder = folderModel.includes(item.model);
        const isSelected = isFolder && item.id === selectedId;
        return (
          <div key={item.model + item.id}>
            <Button
              onClick={() => onClick(item)}
              variant={isSelected ? "filled" : "default"}
              fullWidth
              mb="sm"
            >
              <Icon name={isFolder ? "folder" : "table"} />
              <Text ml="sm">{item.name}</Text>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
