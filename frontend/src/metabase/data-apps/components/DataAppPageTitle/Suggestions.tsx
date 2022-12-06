import React from "react";
import _ from "lodash";
import { t } from "ttag";

import SelectList from "metabase/components/SelectList";

import { OptionsList } from "./DataAppPageTitle.styled";

type CardName = string;
type ColumnName = string;

export interface SuggestionsProps {
  suggestions: Record<CardName, ColumnName[]>;
  selectedCardName?: CardName;
  onSelectCard: (cardName: CardName) => void;
  onSelectColumn: (columnName: ColumnName) => void;
  onBack?: () => void;
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
  onBack,
}: SuggestionsProps) {
  const options = selectedCardName
    ? suggestions[selectedCardName]
    : Object.keys(suggestions);

  const icon = selectedCardName ? "field" : "document";

  return (
    <OptionsList>
      {typeof onBack === "function" && (
        <SelectList.Item
          id="back"
          name={t`Back`}
          icon="chevronleft"
          onSelect={onBack}
        >
          {t`Back`}
        </SelectList.Item>
      )}
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
