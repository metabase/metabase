import React, { useCallback, useState } from "react";
import { t } from "ttag";
import _ from "lodash";

import EditableText, {
  EditableTextProps,
} from "metabase/core/components/EditableText";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import Icon from "metabase/components/Icon";

import Suggestions from "./Suggestions";
import { Root, IconButton } from "./DataAppPageTitle.styled";

type CardName = string;
type ColumnName = string;

export interface DataAppPageTitleProps
  extends Omit<EditableTextProps, "initialValue"> {
  titleTemplate: string;
  compiledTitle?: string;
  suggestions: Record<CardName, ColumnName[]>;
  isEditing?: boolean;
}

function DataAppPageTitle({
  titleTemplate,
  compiledTitle,
  suggestions,
  isEditing = false,
  onChange,
  ...props
}: DataAppPageTitleProps) {
  const [selectedCardName, setSelectedCardName] = useState("");

  const hasSuggestions = Object.keys(suggestions).length > 0;

  const onSelect = useCallback(
    (columnName: string) => {
      const token = `{{ data.${selectedCardName}.${columnName} }}`;
      onChange?.(titleTemplate + token);
      setSelectedCardName("");
    },
    [selectedCardName, titleTemplate, onChange],
  );

  const handleBack = selectedCardName
    ? () => setSelectedCardName("")
    : undefined;

  return (
    <TippyPopoverWithTrigger
      renderTrigger={({ onClick: handleShowPopover }) => (
        <Root>
          <EditableText
            {...props}
            initialValue={isEditing ? titleTemplate : compiledTitle}
            isEditing={isEditing}
            isOptional
            onChange={onChange}
          />
          {isEditing && (
            <IconButton onClick={handleShowPopover} disabled={!hasSuggestions}>
              <Icon
                name="database"
                tooltip={
                  hasSuggestions
                    ? null
                    : t`Page should have an object detail card to reference data`
                }
              />
            </IconButton>
          )}
        </Root>
      )}
      popoverContent={({ closePopover }) => (
        <Suggestions
          suggestions={suggestions}
          selectedCardName={selectedCardName}
          onSelectCard={setSelectedCardName}
          onSelectColumn={columnName => {
            onSelect(columnName);
            closePopover();
          }}
          onBack={handleBack}
        />
      )}
    />
  );
}

export default DataAppPageTitle;
