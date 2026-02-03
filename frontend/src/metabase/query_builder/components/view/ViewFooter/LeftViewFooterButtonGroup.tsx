import cx from "classnames";
import { t } from "ttag";

import { ButtonGroup } from "metabase/common/components/ButtonGroup";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import {
  onCloseChartSettings,
  onCloseChartType,
  onOpenChartSettings,
  onOpenChartType,
} from "metabase/query_builder/actions";
import { ViewButton } from "metabase/query_builder/components/view/ViewButton";
import { getQuestion, getUiControls } from "metabase/query_builder/selectors";
import { Group } from "metabase/ui";
import type { QueryBuilderUIControls } from "metabase-types/store";

import S from "./LeftViewFooterButtonGroup.module.css";

export const LeftViewFooterButtonGroup = () => {
  const {
    isShowingChartSettingsSidebar,
    isShowingChartTypeSidebar,
  }: QueryBuilderUIControls = useSelector(getUiControls);
  const question = useSelector(getQuestion);

  const dispatch = useDispatch();

  const handleVizTypeClick = isShowingChartTypeSidebar
    ? () => dispatch(onCloseChartType())
    : () => dispatch(onOpenChartType());

  const handleVizSettingClick = isShowingChartSettingsSidebar
    ? () => dispatch(onCloseChartSettings())
    : () => dispatch(onOpenChartSettings());

  useRegisterShortcut(
    [
      {
        id: "query-builder-toggle-viz-types",
        perform: handleVizTypeClick,
      },
      {
        id: "query-builder-toggle-viz-settings",
        perform: handleVizSettingClick,
      },
    ],
    [isShowingChartTypeSidebar, isShowingChartSettingsSidebar],
  );

  return (
    <Group className={cx(CS.flex1, S.Root)}>
      <ButtonGroup className={S.FooterButtonGroup}>
        <ViewButton
          medium
          labelBreakpoint="sm"
          data-testid="viz-type-button"
          active={isShowingChartTypeSidebar}
          className={S.Button}
          onClick={handleVizTypeClick}
        >
          {t`Visualization`}
        </ViewButton>
        <ViewButton
          disabled={question?.display() === "list"}
          className={S.Button}
          active={isShowingChartSettingsSidebar}
          icon="gear"
          iconSize={16}
          medium
          onlyIcon
          labelBreakpoint="sm"
          data-testid="viz-settings-button"
          onClick={
            isShowingChartSettingsSidebar
              ? () => dispatch(onCloseChartSettings())
              : () => dispatch(onOpenChartSettings())
          }
        />
      </ButtonGroup>
    </Group>
  );
};
