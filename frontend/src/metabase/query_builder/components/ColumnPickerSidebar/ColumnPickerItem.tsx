import { forwardRef, useEffect, useState } from "react";
import { t } from "ttag";

import {
  HoverParent,
  QueryColumnInfoIcon,
} from "metabase/common/components/MetadataInfo/ColumnInfoIcon";
import type { FieldPickerItem } from "metabase/querying/notebook/components/FieldPicker";
import { Box, Checkbox, Flex, Text, TextInput } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./ColumnPickerSidebar.module.css";

export interface ColumnPickerItemProps {
  query: Lib.Query;
  stageIndex: number;
  item: FieldPickerItem & { isSelected: boolean; isDisabled: boolean };
  onToggle?: (column: Lib.ColumnMetadata, isSelected: boolean) => void;
  isDraggable: boolean;
  handle?: React.ReactNode;
  style?: React.CSSProperties;
  displayName: string;
  onDisplayNameChange: (
    column: Lib.ColumnMetadata,
    displayName: string,
  ) => void;
}

const ColumnPickerItem = forwardRef<HTMLLIElement, ColumnPickerItemProps>(
  function ColumnPickerItem(props, ref) {
    const {
      query,
      stageIndex,
      item,
      onToggle,
      isDraggable,
      handle,
      displayName,
      onDisplayNameChange,
      ...rest
    } = props;
    const [editingName, setEditingName] = useState(displayName);

    useEffect(() => {
      setEditingName(displayName);
    }, [displayName]);

    const handleSaveEdit = () => {
      if (editingName.trim() && editingName.trim() !== displayName) {
        onDisplayNameChange(item.column, editingName.trim());
      }
    };

    return (
      <li key={item.columnInfo.displayName} ref={ref} {...rest}>
        <HoverParent className={S.Label} as="label">
          <Flex align="center" gap="xs" w="100%">
            {isDraggable && handle}
            {!isDraggable && (
              <Checkbox
                checked={item.isSelected}
                disabled={item.isDisabled}
                onChange={(event) =>
                  onToggle?.(item.column, event.target.checked)
                }
              />
            )}
            {!isDraggable && (
              <QueryColumnInfoIcon
                className={S.ItemIcon}
                query={query}
                stageIndex={stageIndex}
                column={item.column}
                position="top-start"
                size={16}
              />
            )}
            <Box flex={1}>
              {isDraggable ? (
                <TextInput
                  value={editingName}
                  onChange={(event) =>
                    setEditingName(event.currentTarget.value)
                  }
                  size="md"
                  onBlur={handleSaveEdit}
                />
              ) : (
                <Text title={t`Click to edit display name`}>
                  {item.columnInfo.longDisplayName}
                </Text>
              )}
            </Box>
          </Flex>
        </HoverParent>
      </li>
    );
  },
);

export { ColumnPickerItem };
