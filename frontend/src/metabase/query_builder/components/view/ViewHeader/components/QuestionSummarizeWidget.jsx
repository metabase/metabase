/* eslint-disable react/prop-types */
import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

export function QuestionSummarizeWidget({
  isShowingSummarySidebar,
  onEditSummary,
  onCloseSummary,
}) {
  const handleClick = () => {
    if (isShowingSummarySidebar) {
      onCloseSummary();
    } else {
      onEditSummary();
    }
  };

  useRegisterShortcut(
    [
      {
        id: "query-builder-toggle-summarize-sidebar",
        perform: handleClick,
      },
    ],
    [isShowingSummarySidebar],
  );

  return (
    <Button
      color="summarize"
      variant={isShowingSummarySidebar ? "filled" : "default"}
      leftSection={<Icon name="sum" />}
      onClick={handleClick}
      data-active={isShowingSummarySidebar}
      className={ViewTitleHeaderS.SummarizeButton}
      classNames={{
        root: ViewTitleHeaderS.ActionButtonRoot,
        label: ViewTitleHeaderS.ActionButtonLabel,
        section: ViewTitleHeaderS.ActionButtonSection,
      }}
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
