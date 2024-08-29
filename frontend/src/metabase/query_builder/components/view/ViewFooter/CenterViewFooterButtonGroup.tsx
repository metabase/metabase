import CS from "metabase/css/core/index.css";
import type { QueryBuilderUIControls } from "metabase-types/store";

import type { QuestionDisplayToggleProps } from "../QuestionDisplayToggle";
import QuestionDisplayToggle from "../QuestionDisplayToggle";

export type CenterViewFooterButtonGroupProps = {
  setUIControls: (uiControls: Partial<QueryBuilderUIControls>) => void;
} & Pick<QuestionDisplayToggleProps, "question" | "isShowingRawTable">;

export const CenterViewFooterButtonGroup = ({
  question,
  isShowingRawTable,
  setUIControls,
}: CenterViewFooterButtonGroupProps) => (
  <QuestionDisplayToggle
    className={CS.mx1}
    question={question}
    isShowingRawTable={isShowingRawTable}
    onToggleRawTable={isShowingRawTable => {
      setUIControls({ isShowingRawTable });
    }}
  />
);
