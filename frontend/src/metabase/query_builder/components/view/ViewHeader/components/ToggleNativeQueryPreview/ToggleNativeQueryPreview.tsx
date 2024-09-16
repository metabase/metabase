import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setNotebookNativePreviewState,
  setUIControls,
} from "metabase/query_builder/actions";
import { getUiControls } from "metabase/query_builder/selectors";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import { trackNotebookNativePreviewShown } from "../../../../../analytics";

import CS from "./ToggleNativeQueryPreview.module.css";

const BUTTON_TEXT = {
  sql: t`View the SQL`,
  json: t`View the native query`,
};

const BUTTON_CLOSE_TEXT = {
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
  const buttonText = isShowingNotebookNativePreview
    ? BUTTON_CLOSE_TEXT[engineType]
    : BUTTON_TEXT[engineType];

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
    <Button onClick={handleClick} aria-label={buttonText}>
      <Icon size="1rem" name="sql" className={CS.icon} />
      {buttonText}
    </Button>
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
