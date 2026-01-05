import { t } from "ttag";

import { getEngineNativeType } from "metabase/lib/engine";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setUIControls } from "metabase/query_builder/actions";
import { trackNotebookNativePreviewShown } from "metabase/query_builder/analytics";
import { getUiControls } from "metabase/query_builder/selectors";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
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

    trackNotebookNativePreviewShown(question, !isShowingNotebookNativePreview);
  };

  return (
    <Tooltip label={buttonText} position="top">
      <ActionIcon
        aria-label={buttonText}
        size={32}
        role="switch"
        variant="viewHeader"
        onClick={handleClick}
      >
        <Icon name="sql" />
      </ActionIcon>
    </Tooltip>
  );
};

ToggleNativeQueryPreview.shouldRender = canShowNativePreview;
