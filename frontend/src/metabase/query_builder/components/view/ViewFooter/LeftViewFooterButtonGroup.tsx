import { useMemo } from "react";
import { t } from "ttag";

import { EditorViewControl } from "embedding-sdk/components/private/EditorViewControl";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onOpenChartSettings,
  setQueryBuilderMode,
  setUIControls,
} from "metabase/query_builder/actions";
// import ViewButton from "metabase/query_builder/components/view/ViewButton";
// import { FooterButtonGroup } from "metabase/query_builder/components/view/ViewFooter.styled";
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

  const dispatch = useDispatch();
  const isShowingRawTable = useSelector(getIsShowingRawTable);
  const vizIcon = getIconForVisualizationType(question.display());

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
        // also we need to add a spinner :boom:
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
      {/* <ViewButton
            medium
            labelBreakpoint="sm"
            data-testid="viz-type-button"
            active={isShowingChartTypeSidebar}
            onClick={
              isShowingChartTypeSidebar
                ? () => dispatch(onCloseChartType())
                : () => dispatch(onOpenChartType())
            }
          >
            {t`Visualization type`}
          </ViewButton> */}
      {/* <ViewButton
            active={isShowingChartSettingsSidebar}
            icon="gear"
            iconSize={16}
            medium
            iconWithText
            labelBreakpoint="sm"
            data-testid="viz-settings-button"
            onClick={
              isShowingChartSettingsSidebar
                ? () => dispatch(onCloseChartSettings())
                : () => dispatch(onOpenChartSettings())
            }
          >{isShowingChartSettingsSidebar ? t`Done` : t`Settings`}</ViewButton> */}
      {/* TODO: mah is a hack for 32px height button */}
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
          mah="xl"
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
