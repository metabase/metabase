import React from "react";

import CheckBox from "metabase/core/components/CheckBox";
import { Card } from "metabase-types/api";
import {
  QuestionListItemRoot,
  CheckboxContainer,
} from "./QuestionListItem.styled";

interface QuestionListItemProps {
  card: Card;
  onChange: (value: boolean) => void;
  isEnabled: boolean;
}

export const QuestionListItem = React.memo(function QuestionListItem({
  card,
  onChange,
  isEnabled,
}: QuestionListItemProps) {
  return (
    <QuestionListItemRoot>
      <CheckboxContainer>
        <CheckBox
          label={card.name}
          labelEllipsis
          checked={isEnabled}
          onChange={e => onChange(e.currentTarget.checked)}
        />
      </CheckboxContainer>
    </QuestionListItemRoot>
  );
});
