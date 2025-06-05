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
import type Question from "metabase-lib/v1/Question";

import { canShowNativePreview } from "../../utils";

const BUTTON_TEXT = {
  get sql() {
    return t`View SQL`;
  },
  get json() {
    return t`View native query`;
  },
};

const BUTTON_CLOSE_TEXT = {
  get sql() {
    return t`Hide SQL`;
  },
  get json() {
    return t`Hide native query`;
  },
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

  const screenSize = useNotebookScreenSize();

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

    // the setting is intentionally remembered only for large screens
    if (screenSize === "large") {
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

ToggleNativeQueryPreview.shouldRender = canShowNativePreview;
