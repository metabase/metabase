import { useState } from "react";

import { NavLink } from "@mantine/core"; // TODO, get this into metabase-ui

import { Flex, Text, Box } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { PickerColumn } from "./EntityPicker.styled";

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
    } else  {
      handleItemSelect(item);
    }
  };

  return (
    <Flex h="70vh" w="80vw">
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

  if(!items.length) {
    return (
      <Box>
        <Text>No items</Text>
      </Box>
    )
  }

  return (
    <PickerColumn>
      {items.map(item => {
        const isFolder = folderModel.includes(item.model);
        const isSelected = isFolder && item.id === selectedId;
        return (
          <div>
            <NavLink
              label={item.name}
              active={isSelected}
              icon={<Icon name={isFolder ? "folder" : "table"} />}
              onClick={() => onClick(item)}
              variant="filled"
            />
          </div>
        );
      })}
    </PickerColumn>
  );
}
