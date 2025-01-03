import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setNotebookNativePreviewState,
  setUIControls,
} from "metabase/query_builder/actions";
import { trackNotebookNativePreviewShown } from "metabase/query_builder/analytics";
import { getUiControls } from "metabase/query_builder/selectors";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

const BUTTON_TEXT = {
  sql: t`View SQL`,
  json: t`View native query`,
};

const BUTTON_CLOSE_TEXT = {
  sql: t`Hide SQL`,
  json: t`Hide native query`,
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
    <Button
      leftIcon={<Icon name="sql" />}
      onClick={handleClick}
      aria-label={buttonText}
    >
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
