import cx from "classnames";
import { t } from "ttag";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setNotebookNativePreviewState,
  setUIControls,
} from "metabase/query_builder/actions";
import { getUiControls } from "metabase/query_builder/selectors";
import { Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { trackNotebookNativePreviewShown } from "../../../../../analytics";

import ToggleNativeQueryPreviewS from "./ToggleNativeQueryPreview.module.css";

const BUTTON_TOOLTIP = {
  sql: t`View the SQL`,
  json: t`View the native query`,
};

const BUTTON_TOOLTIP_CLOSE = {
  sql: t`Hide the SQL`,
  json: t`Hide the native query`,
};

interface ToggleNativeQueryPreviewProps {
  question: Question;
}

export const ToggleNativeQueryPreview = ({
  question,
}: ToggleNativeQueryPreviewProps): JSX.Element => {
  const dispatch = useDispatch();
  const {
    isShowingNotebookNativePreview,
  }: { isShowingNotebookNativePreview: boolean } = useSelector(getUiControls);

  const engineType = getEngineNativeType(question.database()?.engine);
  const tooltip = isShowingNotebookNativePreview
    ? BUTTON_TOOLTIP_CLOSE[engineType]
    : BUTTON_TOOLTIP[engineType];

  const handleClick = () => {
    dispatch(
      setUIControls({
        isShowingNotebookNativePreview: !isShowingNotebookNativePreview,
      }),
    );

    dispatch(setNotebookNativePreviewState(!isShowingNotebookNativePreview));

    trackNotebookNativePreviewShown(question, !isShowingNotebookNativePreview);
  };

  return (
    <Tooltip label={tooltip} position="top">
      <IconButtonWrapper
        className={cx(ToggleNativeQueryPreviewS.SqlButton, {
          [ToggleNativeQueryPreviewS.isSelected]:
            isShowingNotebookNativePreview,
        })}
        onClick={handleClick}
        aria-label={tooltip}
      >
        <Icon size="1rem" name="sql" />
      </IconButtonWrapper>
    </Tooltip>
  );
};

interface ToggleNativeQueryPreviewOpts {
  question: Question;
  queryBuilderMode: string;
}

ToggleNativeQueryPreview.shouldRender = ({
  question,
  queryBuilderMode,
}: ToggleNativeQueryPreviewOpts) => {
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const isMetric = question.type() === "metric";

  return (
    !isNative &&
    !isMetric &&
    question.database()?.native_permissions === "write" &&
    queryBuilderMode === "notebook" &&
    !question.isArchived()
  );
};
