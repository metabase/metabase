import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { useDispatch, useSelector } from "metabase/redux";
import type { QueryBuilderUIControls } from "metabase/redux/store";
import { Button, Group, Icon } from "metabase/ui";

import {
  onCloseChartSettings,
  onCloseChartType,
  onOpenChartSettings,
  onOpenChartType,
} from "../../../store/actions";
import { getQuestion, getUiControls } from "../../../store/selectors";

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
      <Button.Group>
        <Button
          variant="light"
          data-testid="viz-type-button"
          aria-pressed={isShowingChartTypeSidebar}
          onClick={handleVizTypeClick}
        >
          {t`Visualization`}
        </Button>
        <Button
          variant="light"
          disabled={question?.display() === "list"}
          data-testid="viz-settings-button"
          aria-pressed={isShowingChartSettingsSidebar}
          leftSection={<Icon name="gear" />}
          onClick={handleVizSettingClick}
        />
      </Button.Group>
    </Group>
  );
};
