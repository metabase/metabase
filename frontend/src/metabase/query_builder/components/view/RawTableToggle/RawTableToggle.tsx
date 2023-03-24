import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import { getIconForVisualizationType } from "metabase/visualizations";
import Question from "metabase-lib/Question";
import { Well, ToggleIcon } from "./RawTableToggle.styled";

interface RawTableToggleProps {
  className?: string;
  question: Question;
  isShowingRawTable: boolean;
  onShowTable?: (isRawTable: boolean) => void;
}

const RawTableToggle = ({
  className,
  question,
  isShowingRawTable,
  onShowTable,
}: RawTableToggleProps) => {
  const vizIcon = getIconForVisualizationType(question.display());
  return (
    <Well
      className={className}
      onClick={() => onShowTable?.(!isShowingRawTable)}
    >
      <ToggleIcon active={isShowingRawTable} aria-label={t`Switch to data`}>
        <Icon name="table2" />
      </ToggleIcon>
      <ToggleIcon
        active={!isShowingRawTable}
        aria-label={t`Switch to visualization`}
      >
        <Icon name={vizIcon} />
      </ToggleIcon>
    </Well>
  );
};

export default RawTableToggle;
