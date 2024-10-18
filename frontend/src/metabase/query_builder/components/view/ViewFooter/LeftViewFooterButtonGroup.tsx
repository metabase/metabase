import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onCloseChartType,
  onOpenChartSettings,
  onOpenChartType,
  setQueryBuilderMode,
} from "metabase/query_builder/actions";
import ViewButton from "metabase/query_builder/components/view/ViewButton";
import { FooterButtonGroup } from "metabase/query_builder/components/view/ViewFooter.styled";
import { getUiControls } from "metabase/query_builder/selectors";
import { Box, Flex, Group, Icon, Tooltip, rem } from "metabase/ui";
import type { QueryBuilderUIControls } from "metabase-types/store";
import { Button } from "metabase/ui";
import LS from "./LeftViewFooterButtonGroup.module.css"
import { EditorViewControl } from "embedding-sdk/components/private/EditorViewControl";

export const LeftViewFooterButtonGroup = () => {
  const {
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
  }: QueryBuilderUIControls = useSelector(getUiControls);

  const dispatch = useDispatch();

  const data = [
    {
      value: "editor",
      label: <Tooltip label={t`Editor`}><Icon name="notebook" onClick={() => {
        dispatch(setQueryBuilderMode("notebook"));
      }} /></Tooltip>,
    },
    {
      value: "table",
      label: <Tooltip label={t`Results`}><Icon name="table2" /></Tooltip>,
    },
    {
      value: "visualization",
      // here icon should match visualization, which we'll get from props
      // also we need to add a spinner :boom:
      label: <Tooltip label={t`Visualization`}><Icon name="line" /></Tooltip>,
    },
  ];


  return (
    <>
      <EditorViewControl data={data} />
      <Group className={CS.flex1}>
        <FooterButtonGroup>
          <ViewButton
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
          </ViewButton>
          <ViewButton
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
          >{t`Settings`}</ViewButton>
        </FooterButtonGroup>
      </Group>
    </>
  );
};
