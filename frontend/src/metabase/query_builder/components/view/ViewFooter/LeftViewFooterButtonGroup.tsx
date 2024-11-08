import { useMemo } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { EditorViewControl } from "embedding-sdk/components/private/EditorViewControl";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onOpenChartSettings,
  setQueryBuilderMode,
  setUIControls,
} from "metabase/query_builder/actions";
import {
  getIsShowingRawTable,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Button, Flex, Icon, Tooltip } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderUIControls } from "metabase-types/store";

interface LeftViewFooterButtonGroupProps {
  question: Question;
}

export const LeftViewFooterButtonGroup = ({
  question,
}: LeftViewFooterButtonGroupProps) => {
  const { isShowingChartSettingsSidebar }: QueryBuilderUIControls =
    useSelector(getUiControls);
  const isShowingRawTable = useSelector(getIsShowingRawTable);
  const vizIcon = getIconForVisualizationType(question.display());

  useUnmount(() => {
    // reset showing raw table, so new mount will default to viz
    dispatch(setUIControls({ isShowingRawTable: false }));
  });

  const dispatch = useDispatch();

  const data = useMemo(
    () => [
      {
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
      },
      {
        value: "table",
        label: (
          <Tooltip label={t`Results`}>
            <Icon
              name="table2"
              onClick={() => {
                dispatch(setUIControls({ isShowingRawTable: true }));
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
              name={vizIcon}
              onClick={() => {
                dispatch(setUIControls({ isShowingRawTable: false }));
              }}
            />
          </Tooltip>
        ),
      },
    ],
    [dispatch, vizIcon],
  );

  return (
    <Flex gap="0.75rem">
      <EditorViewControl
        value={isShowingRawTable ? "table" : "visualization"}
        data={data}
      />
      {!isShowingRawTable && (
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
          /* TODO: mah is a hack for 32px height button */
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
