/* eslint-disable react/prop-types */
import cx from "classnames";
import { t } from "ttag";

import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

export function QuestionSummarizeWidget({
  isShowingSummarySidebar,
  onEditSummary,
  onCloseSummary,
  className,
}) {
  return (
    <Button
      color="summarize"
      variant={isShowingSummarySidebar ? "filled" : "default"}
      leftIcon={<Icon name="sum" />}
      onClick={async () => {
        if (isShowingSummarySidebar) {
          onCloseSummary();
        } else {
          onEditSummary();
        }
      }}
      data-active={isShowingSummarySidebar}
      className={cx(className, ViewTitleHeaderS.SummarizeButton)}
    >
      {t`Summarize`}
    </Button>
  );
}

QuestionSummarizeWidget.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    question &&
    !isNative &&
    isEditable &&
    !isObjectDetail &&
    isActionListVisible &&
    !question.isArchived()
  );
};
