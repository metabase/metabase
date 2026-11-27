import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import {
  type SummarySidebarOpenedTriggeredFrom,
  trackSummarySidebarOpened,
} from "../../sidebars/SummarySidebar/analytics";
import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface QuestionSummarizeWidgetProps {
  question: Question;
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
  question,
  isShowingSummarySidebar,
  editSummary,
  onCloseSummary,
}: QuestionSummarizeWidgetProps) {
  const toggleSummary = (triggeredFrom: SummarySidebarOpenedTriggeredFrom) => {
    if (isShowingSummarySidebar) {
      onCloseSummary();
    } else {
      trackSummarySidebarOpened(question, triggeredFrom);
      editSummary();
    }
  };

  useRegisterShortcut([
    {
      id: "query-builder-toggle-summarize-sidebar",
      perform: () => toggleSummary("keyboard_shortcut"),
    },
  ]);

  return (
    <Button
      variant={isShowingSummarySidebar ? "filled" : "default"}
      vars={() => ({
        root: isShowingSummarySidebar ? SUMMARIZE_ACTIVE_VARS : {},
      })}
      leftSection={<Icon name="sum" />}
      onClick={() => toggleSummary("summarize_button")}
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
