import { t } from "ttag";

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

import { SqlButton } from "./ToggleNativeQueryPreview.styled";

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
      <SqlButton
        isSelected={isShowingNotebookNativePreview}
        onClick={handleClick}
        aria-label={tooltip}
      >
        <Icon size="1rem" name="sql" />
      </SqlButton>
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
  return (
    !isNative &&
    question.database()?.native_permissions === "write" &&
    queryBuilderMode === "notebook"
  );
};
