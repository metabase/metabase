import { useMemo } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { EditorViewControl } from "embedding-sdk/components/private/EditorViewControl";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import {
  onCloseChartSettings,
  onOpenChartSettings,
  setQueryBuilderMode,
  setUIControls,
} from "metabase/query_builder/actions";
import {
  getIsShowingRawTable,
  getIsVisualized,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Button, Flex, Icon, Tooltip } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderUIControls } from "metabase-types/store";

interface LeftViewFooterButtonGroupProps {
  question: Question;
  hideChartSettings?: boolean;
}

export const LeftViewFooterButtonGroup = ({
  question,
  hideChartSettings = false,
}: LeftViewFooterButtonGroupProps) => {
  const { isShowingChartSettingsSidebar }: QueryBuilderUIControls =
    useSelector(getUiControls);
  const isShowingRawTable = useSelector(getIsShowingRawTable);
  const vizIcon = getIconForVisualizationType(question.display());
  const { isNative, isEditable } = Lib.queryDisplayInfo(question.query());
  const shouldShowEditorButton =
    !isNative && isEditable && !question.isArchived();

  useUnmount(() => {
    // reset showing raw table, so new mount will default to viz
    dispatch(setUIControls({ isShowingRawTable: false }));
  });

  const dispatch = useDispatch();
  const isVisualized = useSelector(getIsVisualized);
  const shouldShowChartSettingsButton =
    !hideChartSettings && (!isShowingRawTable || isVisualized);

  const data = useMemo(
    () =>
      [
        shouldShowEditorButton
          ? {
              value: "editor",
              label: (
                <Tooltip label={t`Editor`}>
                  <Icon
                    name="notebook"
                    onClick={() => {
                      dispatch(setQueryBuilderMode("notebook"));
                    }}
                  />
                </Tooltip>
              ),
            }
          : null,
        isVisualized && {
          value: "table",
          label: (
            <Tooltip label={t`Results`}>
              <Icon
                aria-label={t`Switch to data`}
                name="table2"
                onClick={() => {
                  dispatch(setUIControls({ isShowingRawTable: true }));
                }}
              />
            </Tooltip>
          ),
        },
        isVisualized && {
          value: "visualization",
          // TODO: also we need to add a spinner :boom:
          label: (
            <Tooltip label={t`Visualization`}>
              <Icon
                aria-label={t`Switch to visualization`}
                name={vizIcon}
                onClick={() => {
                  dispatch(setUIControls({ isShowingRawTable: false }));
                }}
              />
            </Tooltip>
          ),
        },
      ].filter(isNotNull),
    [dispatch, isVisualized, shouldShowEditorButton, vizIcon],
  );

  return (
    <Flex gap="0.75rem">
      {(isVisualized || shouldShowEditorButton) && (
        <EditorViewControl
          value={isShowingRawTable ? "table" : "visualization"}
          data={data}
        />
      )}
      {shouldShowChartSettingsButton && (
        <Button
          radius="xl"
          variant={isShowingChartSettingsSidebar ? "filled" : "default"}
          styles={{
            ...(!isShowingChartSettingsSidebar && {
              root: {
                backgroundColor: "var(--mb-color-brand-lighter)",
                color: "var(--mb-color-brand)",
                border: 0,

                "&:hover": {
                  backgroundColor: "var(--mb-color-focus)",
                },
              },
            }),
          }}
          /* mah is a hack for 32px height button, we don't have it atm */
          mah="xl"
          data-testid="viz-settings-button"
          onClick={
            isShowingChartSettingsSidebar
              ? () => dispatch(onCloseChartSettings())
              : () => dispatch(onOpenChartSettings())
          }
        >
          {isShowingChartSettingsSidebar ? t`Done` : t`Chart settings`}
        </Button>
      )}
    </Flex>
  );
};
