import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onCloseChartType,
  onOpenChartSettings,
  onOpenChartType,
} from "metabase/query_builder/actions";
import ViewButton from "metabase/query_builder/components/view/ViewButton";
import { FooterButtonGroup } from "metabase/query_builder/components/view/ViewFooter.styled";
import { getUiControls } from "metabase/query_builder/selectors";
import { Group } from "metabase/ui";
import type { QueryBuilderUIControls } from "metabase-types/store";

export const LeftViewFooterButtonGroup = () => {
  const {
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
  }: QueryBuilderUIControls = useSelector(getUiControls);

  const dispatch = useDispatch();

  return (
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
  );
};
