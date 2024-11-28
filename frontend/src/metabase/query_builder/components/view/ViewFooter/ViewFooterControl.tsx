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
  getIsVisualized,
  getViewFooterControlState,
} from "metabase/query_builder/selectors";
import { Icon, Loader, Tooltip } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface ViewFooterControlProps {
  question: Question;
  isNotebook?: boolean;
  isRunning: boolean;
}

const ViewFooterControl = ({
  question,
  isNotebook = false,
  isRunning,
}: ViewFooterControlProps) => {
  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const isActionListVisible = useSelector(getIsActionListVisible);
  const shouldShowEditorButton =
    !isNative && isEditable && !question.isArchived() && isActionListVisible;
  const vizIcon = getIconForVisualizationType(question.display());
  const isVisualized = useSelector(getIsVisualized);
  const viewFooterControlState: "editor" | "results" | "visualization" =
    useSelector(getViewFooterControlState);

  const dispatch = useDispatch();

  const value = viewFooterControlState;

  const handleValueChange = (value: "editor" | "results" | "visualization") => {
    if (value === "editor") {
      dispatch(setQueryBuilderMode("notebook"));
    } else {
      dispatch(setUIControls({ isShowingRawTable: value === "results" }));

      if (isNotebook) {
        dispatch(setQueryBuilderMode("view"));
      }
    }

    dispatch(setUIControls({ viewFooterControlState: value }));
  };

  const data = useMemo(
    () =>
      [
        shouldShowEditorButton
          ? {
            value: "editor",
            label: (
              <Tooltip label={t`Editor`}>
                <Icon aria-label={t`Switch to editor`} name="notebook" />
              </Tooltip>
            ),
          }
          : null,
        {
          value: "results",
          disabled: isRunning,
          label: isRunning ? (
            <Loader
              color={
                value === "results"
                  ? "var(--mb-color-text-selected)"
                  : undefined
              }
              size="xs"
            />
          ) : (
            <Tooltip label={t`Results`}>
              <Icon aria-label={t`Switch to data`} name="table2" />
            </Tooltip>
          ),
        },
        {
          value: "visualization",
          disabled: isRunning,
          label: isRunning ? (
            <Loader
              color={
                value === "visualization"
                  ? "var(--mb-color-text-selected)"
                  : undefined
              }
              size="xs"
            />
          ) : (
            <Tooltip label={t`Visualization`}>
              <Icon aria-label={t`Switch to visualization`} name={vizIcon} />
            </Tooltip>
          ),
        },
      ].filter(isNotNull),
    [shouldShowEditorButton, isRunning, value, vizIcon],
  );

  return (
    (isVisualized || shouldShowEditorButton) && (
      <EditorViewControl
        value={value}
        data={data}
        onChange={handleValueChange}
        transitionDuration={0}
      />
    )
  );
};

export { ViewFooterControl };
