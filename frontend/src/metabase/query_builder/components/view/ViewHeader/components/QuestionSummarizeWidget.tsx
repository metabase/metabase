import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface QuestionSummarizeWidgetProps {
  isShowingSummarySidebar: boolean;
  editSummary: () => void;
  onCloseSummary: () => void;
}

const SUMMARIZE_ACTIVE_VARS = {
  "--button-bg": "var(--mb-color-core-summarize)",
  "--button-hover":
    "color-mix(in srgb, var(--mb-color-core-summarize) 88%, transparent)",
  "--button-pressed": "var(--mb-color-core-summarize)",
};

export function QuestionSummarizeWidget({
  isShowingSummarySidebar,
  editSummary,
  onCloseSummary,
}: QuestionSummarizeWidgetProps) {
  const handleClick = () => {
    if (isShowingSummarySidebar) {
      onCloseSummary();
    } else {
      editSummary();
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
      variant={isShowingSummarySidebar ? "filled" : "default"}
      vars={() => ({
        root: isShowingSummarySidebar ? SUMMARIZE_ACTIVE_VARS : {},
      })}
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
}: {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  isObjectDetail: boolean;
  isActionListVisible: boolean;
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
