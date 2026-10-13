import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { getDatasetExplorerUrl } from "metabase/common/metrics-viewer/dataset-explorer";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import type { QueryBuilderMode } from "metabase/redux/store";
import { useNavigate } from "metabase/router";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

export function QuestionSummarizeWidget({ question }: { question: Question }) {
  const navigate = useNavigate();
  const returnTo = Urls.serializedQuestion(question.cardWithNormalizedQuery(), {
    parameterValues: question._parameterValues,
    includeDisplayIsLocked: true,
  });
  const url = getDatasetExplorerUrl(question, returnTo);
  useRegisterShortcut(
    [
      {
        id: "query-builder-toggle-summarize-sidebar",
        perform: () => navigate(url),
      },
    ],
    [url, navigate],
  );

  return (
    <Button
      component={Link}
      to={url}
      leftSection={<Icon name="sum" aria-hidden />}
      className={ViewTitleHeaderS.SummarizeButton}
      classNames={{
        root: ViewTitleHeaderS.ActionButtonRoot,
        label: ViewTitleHeaderS.ActionButtonLabel,
        section: ViewTitleHeaderS.ActionButtonSection,
      }}
    >{t`Summarize`}</Button>
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
