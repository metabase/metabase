import cx from "classnames";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/redux";
import { Button, Group, Icon } from "metabase/ui";

import { getQuestion } from "../../../store/selectors";

import S from "./LeftViewFooterButtonGroup.module.css";
import { useVisualizationSidebarToggles } from "./use-visualization-sidebar-toggles";

export const LeftViewFooterButtonGroup = () => {
  const question = useSelector(getQuestion);
  const {
    isShowingChartTypeSidebar,
    isShowingChartSettingsSidebar,
    toggleChartType,
    toggleChartSettings,
  } = useVisualizationSidebarToggles();

  return (
    <Group className={cx(CS.flex1, S.Root)}>
      <Button.Group>
        <Button
          variant="light"
          data-testid="viz-type-button"
          aria-pressed={isShowingChartTypeSidebar}
          onClick={toggleChartType}
        >
          {t`Visualization`}
        </Button>
        <Button
          variant="light"
          disabled={question?.display() === "list"}
          data-testid="viz-settings-button"
          aria-pressed={isShowingChartSettingsSidebar}
          leftSection={<Icon name="gear" />}
          onClick={toggleChartSettings}
        />
      </Button.Group>
    </Group>
  );
};
