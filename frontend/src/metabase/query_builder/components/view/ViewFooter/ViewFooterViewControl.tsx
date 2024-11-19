import { useMemo } from "react";
import { t } from "ttag";

import { EditorViewControl } from "embedding-sdk/components/private/EditorViewControl";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import {
  setQueryBuilderMode,
  setUIControls,
} from "metabase/query_builder/actions";
import {
  getIsActionListVisible,
  getIsShowingRawTable,
  getIsVisualized,
} from "metabase/query_builder/selectors";
import { Icon, Tooltip } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface ViewFooterControlProps {
  question: Question;
  isNotebook?: boolean;
}

const ViewFooterControl = ({
  question,
  isNotebook = false,
}: ViewFooterControlProps) => {
  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const isActionListVisible = useSelector(getIsActionListVisible);
  const shouldShowEditorButton =
    !isNative && isEditable && !question.isArchived() && isActionListVisible;
  const vizIcon = getIconForVisualizationType(question.display());
  const isShowingRawTable = useSelector(getIsShowingRawTable);
  const isVisualized = useSelector(getIsVisualized);

  const dispatch = useDispatch();

  const data = useMemo(
    () =>
      [
        shouldShowEditorButton
          ? {
              value: "editor",
              label: (
                <Tooltip label={t`Editor`}>
                  <Icon
                    aria-label={t`Switch to editor`}
                    name="notebook"
                    onClick={() => {
                      dispatch(setQueryBuilderMode("notebook"));
                    }}
                  />
                </Tooltip>
              ),
            }
          : null,
        {
          value: "table",
          label: (
            <Tooltip label={t`Results`}>
              <Icon
                aria-label={t`Switch to data`}
                name="table2"
                onClick={() => {
                  dispatch(setUIControls({ isShowingRawTable: true }));
                  if (isNotebook) {
                    dispatch(setQueryBuilderMode("view"));
                  }
                }}
              />
            </Tooltip>
          ),
        },
        {
          value: "visualization",
          // TODO: also we need to add a spinner :boom:
          label: (
            <Tooltip label={t`Visualization`}>
              <Icon
                aria-label={t`Switch to visualization`}
                name={vizIcon}
                onClick={() => {
                  dispatch(setUIControls({ isShowingRawTable: false }));
                  if (isNotebook) {
                    dispatch(setQueryBuilderMode("view"));
                  }
                }}
              />
            </Tooltip>
          ),
        },
      ].filter(isNotNull),
    [dispatch, isNotebook, shouldShowEditorButton, vizIcon],
  );

  function getSelectedControlValue() {
    if (isNotebook) {
      return "editor";
    }

    return isShowingRawTable ? "table" : "visualization";
  }

  return (
    (isVisualized || shouldShowEditorButton) && (
      <EditorViewControl value={getSelectedControlValue()} data={data} />
    )
  );
};

export { ViewFooterControl };
