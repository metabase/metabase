import { match } from "ts-pattern";
import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  setNotebookNativePreviewState,
  setUIControls,
} from "metabase/query_builder/actions";
import { trackNotebookNativePreviewShown } from "metabase/query_builder/analytics";
import { useNotebookScreenSize } from "metabase/query_builder/hooks/use-notebook-screen-size";
import { getUiControls } from "metabase/query_builder/selectors";
import { Button, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

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

  const { isLargeScreen } = useNotebookScreenSize();

  const engineType = getEngineNativeType(question.database()?.engine);
  const buttonText = getButtonText({
    isShowingNotebookNativePreview,
    engineType,
  });

  const handleClick = () => {
    dispatch(
      setUIControls({
        isShowingNotebookNativePreview: !isShowingNotebookNativePreview,
      }),
    );

    if (isLargeScreen) {
      // the setting is intentionally remembered only for large screens
      dispatch(setNotebookNativePreviewState(!isShowingNotebookNativePreview));
    }

    trackNotebookNativePreviewShown(question, !isShowingNotebookNativePreview);
  };

  return (
    <Button
      leftSection={<Icon name="sql" />}
      onClick={handleClick}
      aria-label={buttonText}
    >
      {buttonText}
    </Button>
  );
};

function getButtonText({
  isShowingNotebookNativePreview,
  engineType,
}: {
  isShowingNotebookNativePreview: boolean;
  engineType: "sql" | "json";
}) {
  return match({ isShowingNotebookNativePreview, engineType })
    .with(
      { isShowingNotebookNativePreview: true, engineType: "sql" },
      () => t`Hide SQL`,
    )
    .with(
      { isShowingNotebookNativePreview: true, engineType: "json" },
      () => t`Hide native query`,
    )
    .with(
      { isShowingNotebookNativePreview: false, engineType: "sql" },
      () => t`View SQL`,
    )
    .with(
      { isShowingNotebookNativePreview: false, engineType: "json" },
      () => t`View native query`,
    )
    .exhaustive();
}

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
