import cx from "classnames";
import { t } from "ttag";

import { getUiControls } from "metabase/query_builder/selectors";
import {
  onCloseChartSettings,
  onOpenChartSettings,
} from "metabase/redux/query-builder";
import type { QueryBuilderMode } from "metabase/redux/store";
import { Button, Icon } from "metabase/ui";
import { useDispatch, useSelector } from "metabase/utils/redux";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import ViewTitleHeaderS from "../ViewTitleHeader.module.css";

interface ColumnsHeaderButtonProps {
  // Accepted for API symmetry with FilterHeaderButton; shouldRender uses it.
  question: Question;
}

export function ColumnsHeaderButton(_props: ColumnsHeaderButtonProps) {
  const dispatch = useDispatch();
  const { isShowingChartSettingsSidebar } = useSelector(getUiControls);

  const handleClick = () => {
    if (isShowingChartSettingsSidebar) {
      dispatch(onCloseChartSettings());
    } else {
      dispatch(
        onOpenChartSettings({ initialChartSettings: { section: "Columns" } }),
      );
    }
  };

  return (
    <Button
      className={cx(ViewTitleHeaderS.FilterButton)}
      classNames={{
        root: ViewTitleHeaderS.ActionButtonRoot,
        label: ViewTitleHeaderS.ActionButtonLabel,
        section: ViewTitleHeaderS.ActionButtonSection,
      }}
      leftSection={<Icon name="table2" />}
      onClick={handleClick}
      data-testid="question-columns-header"
      aria-pressed={isShowingChartSettingsSidebar}
    >
      {t`Columns`}
    </Button>
  );
}

interface RenderCheckOpts {
  question: Question;
  queryBuilderMode: QueryBuilderMode;
  isObjectDetail: boolean;
  isActionListVisible: boolean;
}

ColumnsHeaderButton.shouldRender = ({
  question,
  queryBuilderMode,
  isObjectDetail,
  isActionListVisible,
}: RenderCheckOpts) => {
  const { isEditable, isNative } = Lib.queryDisplayInfo(question.query());
  return (
    queryBuilderMode === "view" &&
    !isNative &&
    isEditable &&
    !isObjectDetail &&
    isActionListVisible &&
    !question.isArchived()
  );
};
