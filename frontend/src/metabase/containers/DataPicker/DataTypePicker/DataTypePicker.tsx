import React from "react";

import type { DataTypeInfoItem } from "../utils";
import type { DataPickerDataType } from "../types";

import {
  List,
  ItemContainer,
  TitleContainer,
  ItemIcon,
  ItemTitle,
  ItemDescriptionContainer,
  ItemDescription,
} from "./DataTypePicker.styled";

interface DataTypePickerProps {
  types: DataTypeInfoItem[];
  onChange: (value: DataPickerDataType) => void;
}

interface ListItemProps extends DataTypeInfoItem {
  onSelect: () => void;
}

function DataTypePickerListItem({
  id,
  name,
  icon,
  description,
  onSelect,
}: ListItemProps) {
  return (
    <ItemContainer id={id} name={name} onSelect={onSelect}>
      <TitleContainer>
        <ItemIcon name={icon} size={18} />
        <ItemTitle>{name}</ItemTitle>
      </TitleContainer>
      <ItemDescriptionContainer>
        <ItemDescription>{description}</ItemDescription>
      </ItemDescriptionContainer>
    </ItemContainer>
  );
}

function DataTypePicker({ types, onChange }: DataTypePickerProps) {
  return (
    <List>
      {types.map(dataType => (
        <DataTypePickerListItem
          {...dataType}
          key={dataType.id}
          onSelect={() => onChange(dataType.id)}
        />
      ))}
    </List>
  );
}

export default DataTypePicker;
