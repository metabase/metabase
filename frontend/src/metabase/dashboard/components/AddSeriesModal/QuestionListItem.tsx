import { memo } from "react";

import CheckBox from "metabase/core/components/CheckBox";
import { Box } from "metabase/ui";
import type { Card } from "metabase-types/api";

import S from "./QuestionListItem.module.css";

interface QuestionListItemProps {
  card: Card;
  onChange: (value: boolean) => void;
  isEnabled: boolean;
}

export const QuestionListItem = memo(function QuestionListItem({
  card,
  onChange,
  isEnabled,
}: QuestionListItemProps) {
  return (
    <Box component="li" className={S.QuestionListItemRoot}>
      <Box className={S.CheckboxContainer}>
        <CheckBox
          label={card.name}
          labelEllipsis
          checked={isEnabled}
          onChange={e => onChange(e.currentTarget.checked)}
        />
      </Box>
    </Box>
  );
});
