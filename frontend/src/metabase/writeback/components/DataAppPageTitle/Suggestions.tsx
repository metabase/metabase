import React from "react";
import _ from "lodash";

import SelectList from "metabase/components/SelectList";

import { OptionsList } from "./DataAppPageTitle.styled";

type CardName = string;
type ColumnName = string;

export interface SuggestionsProps {
  suggestions: Record<CardName, ColumnName[]>;
  selectedCardName?: CardName;
  onSelectCard: (cardName: CardName) => void;
  onSelectColumn: (columnName: ColumnName) => void;
}

function humanizeCamelCase(str: string) {
  const words = _.words(str);
  return words.map(word => _.capitalize(word)).join(" ");
}

function Suggestions({
  suggestions,
  selectedCardName,
  onSelectCard,
  onSelectColumn,
}: SuggestionsProps) {
  const options = selectedCardName
    ? suggestions[selectedCardName]
    : Object.keys(suggestions);

  const icon = selectedCardName ? "field" : "document";

  return (
    <OptionsList>
      {options.map(option => {
        const name = humanizeCamelCase(option);
        return (
          <SelectList.Item
            key={option}
            id={option}
            name={name}
            icon={icon}
            onSelect={() => {
              if (selectedCardName) {
                onSelectColumn(option);
              } else {
                onSelectCard(option);
              }
            }}
          >
            {name}
          </SelectList.Item>
        );
      })}
    </OptionsList>
  );
}

export default Suggestions;
