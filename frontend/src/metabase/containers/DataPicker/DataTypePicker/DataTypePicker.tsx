import React from "react";
import { t } from "ttag";

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
  onChange: (value: DataPickerDataType) => void;
}

interface ListItemProps {
  id: DataPickerDataType;
  icon: string;
  name: string;
  description: string;
  onSelect: () => void;
}

function getDataTypes(): Omit<ListItemProps, "onSelect">[] {
  return [
    {
      id: "models",
      icon: "model",
      name: t`Models`,
      description: t`The best starting place for new questions.`,
    },
    {
      id: "raw-data",
      icon: "database",
      name: t`Raw Data`,
      description: t`Unaltered tables in connected databases.`,
    },
    // TODO enable when DataPicker has items filtering API
    // {
    //   id: "questions",
    //   name: t`Saved Questions`,
    //   icon: "folder",
    //   description: t`Use any question’s results to start a new question.`,
    // },
  ];
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

function DataTypePicker({ onChange }: DataTypePickerProps) {
  return (
    <List>
      {getDataTypes().map(dataType => (
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
