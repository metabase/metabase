import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import { getIconForVisualizationType } from "metabase/visualizations";
import Question from "metabase-lib/Question";
import { Well, ToggleIcon } from "./RawTableToggle.styled";

interface RawTableToggleProps {
  className?: string;
  question: Question;
  isRawTable: boolean;
  onToggleRawTable: (isRawTable: boolean) => void;
}

const RawTableToggle = ({
  className,
  question,
  isRawTable,
  onToggleRawTable,
}: RawTableToggleProps) => {
  const vizIcon = getIconForVisualizationType(question.display());
  return (
    <Well className={className} onClick={() => onToggleRawTable(!isRawTable)}>
      <ToggleIcon active={isRawTable} aria-label={t`Switch to data`}>
        <Icon name="table2" />
      </ToggleIcon>
      <ToggleIcon active={!isRawTable} aria-label={t`Switch to visualization`}>
        <Icon name={vizIcon} />
      </ToggleIcon>
    </Well>
  );
};

export default RawTableToggle;
