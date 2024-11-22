import { useEffect, useMemo, useState } from "react";
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
import { Icon, Loader, Tooltip } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

interface ViewFooterControlProps {
  question: Question;
  isNotebook?: boolean;
  isResultLoaded: boolean;
}

const ViewFooterControl = ({
  question,
  isNotebook = false,
  isResultLoaded,
}: ViewFooterControlProps) => {
  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const isActionListVisible = useSelector(getIsActionListVisible);
  const shouldShowEditorButton =
    !isNative && isEditable && !question.isArchived() && isActionListVisible;
  const vizIcon = getIconForVisualizationType(question.display());
  const isShowingRawTable = useSelector(getIsShowingRawTable);
  const isVisualized = useSelector(getIsVisualized);

  const dispatch = useDispatch();

  const [value, setValue] = useState<"editor" | "table" | "visualization">(
    isNotebook ? "editor" : isShowingRawTable ? "table" : "visualization",
  );

  useEffect(() => {
    // switch from editor to view
    if (!isNotebook && value === "editor") {
      setValue("visualization");
    }
  }, [isNative, isNotebook, value]);

  useEffect(() => {
    // if another visualization type is selected but the value "table" is
    // selected we need to switch to "visualization"
    if (!isShowingRawTable && value === "table") {
      setValue("visualization");
    }
  }, [isShowingRawTable, value]);

  useEffect(() => {
    // handle "convert to native question" case when segment control is rendered
    // but we do not show "editor" value for it
    if (isNative && value === "editor") {
      setValue("visualization");
    }
  }, [isNative, value]);

  useEffect(() => {
    // switch back to editor
    if (isNotebook && value !== "editor") {
      setValue("editor");
    }
  }, [isNotebook, value]);

  const handleValueChange = (value: "editor" | "table" | "visualization") => {
    if (value === "editor") {
      dispatch(setQueryBuilderMode("notebook"));
    } else {
      dispatch(setUIControls({ isShowingRawTable: value === "table" }));

      if (isNotebook) {
        dispatch(setQueryBuilderMode("view"));
      }
    }

    setValue(value);
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
          value: "table",
          disabled: !isResultLoaded,
          label: isResultLoaded ? (
            <Tooltip label={t`Results`}>
              <Icon
                aria-label={t`Switch to data`}
                name="table2"
                onClick={() => {
                  dispatch(setUIControls({ isShowingRawTable: true }));
                }}
              />
            </Tooltip>
          ) : (
            <Loader
              color={
                value === "table" ? "var(--mb-color-text-selected)" : undefined
              }
              size="xs"
            />
          ),
        },
        {
          value: "visualization",
          disabled: !isResultLoaded,
          label: isResultLoaded ? (
            <Tooltip label={t`Visualization`}>
              <Icon
                aria-label={t`Switch to visualization`}
                name={vizIcon}
                onClick={() => {
                  dispatch(setUIControls({ isShowingRawTable: false }));
                }}
              />
            </Tooltip>
          ) : (
            <Loader
              color={
                value === "visualization"
                  ? "var(--mb-color-text-selected)"
                  : undefined
              }
              size="xs"
            />
          ),
        },
      ].filter(isNotNull),
    [dispatch, isResultLoaded, shouldShowEditorButton, value, vizIcon],
  );

  return (
    (isVisualized || shouldShowEditorButton) && (
      <EditorViewControl
        value={value}
        data={data}
        onChange={handleValueChange}
      />
    )
  );
};

export { ViewFooterControl };
