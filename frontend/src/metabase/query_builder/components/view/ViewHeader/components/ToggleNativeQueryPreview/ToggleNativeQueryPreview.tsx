import { t } from "ttag";

import { getEngineNativeType } from "metabase/databases/utils/engine";
import { LiveDot } from "metabase/querying/notebook/components/NodeBuilder/components/LiveDot";
import { useDispatch, useSelector } from "metabase/redux";
import { setUIControls } from "metabase/redux/query-builder";
import { ActionIcon, Button, Icon, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { trackNotebookNativePreviewShown } from "../../../../../analytics";
import { getUiControls } from "../../../../../store/selectors";
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
    isShowingNodeBuilder,
  }: {
    isShowingNotebookNativePreview: boolean;
    isShowingNodeBuilder: boolean;
  } = useSelector(getUiControls);

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

  if (isShowingNodeBuilder) {
    return (
      <Tooltip label={buttonText} position="top">
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<Icon name="code_block" />}
          rightSection={<LiveDot />}
          aria-label={buttonText}
          aria-pressed={isShowingNotebookNativePreview}
          onClick={handleClick}
        >
          {t`Query`}
        </Button>
      </Tooltip>
    );
  }

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
