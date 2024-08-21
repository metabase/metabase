import CS from "metabase/css/core/index.css";
import type { QueryBuilderUIControls } from "metabase-types/store";

import QuestionDisplayToggle from "../QuestionDisplayToggle";
import type { QuestionDisplayToggleProps } from "../QuestionDisplayToggle/QuestionDisplayToggle";

export type CenterViewFooterButtonGroupProps = {
  isVisualized: boolean;
  setUIControls: (uiControls: Partial<QueryBuilderUIControls>) => void;
} & Pick<QuestionDisplayToggleProps, "question" | "isShowingRawTable">;

export const CenterViewFooterButtonGroup = ({
  isVisualized,
  question,
  isShowingRawTable,
  setUIControls,
}: CenterViewFooterButtonGroupProps) =>
  isVisualized && (
    <QuestionDisplayToggle
      key="viz-table-toggle"
      className={CS.mx1}
      question={question}
      isShowingRawTable={isShowingRawTable}
      onToggleRawTable={isShowingRawTable => {
        setUIControls({ isShowingRawTable });
      }}
    />
  );
