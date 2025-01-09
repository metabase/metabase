import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onOpenChartSettings,
} from "metabase/query_builder/actions";
import { getUiControls } from "metabase/query_builder/selectors";
import { Button, type ButtonProps, Flex, Icon, rem } from "metabase/ui";
import { getIconForVisualizationType } from "metabase/visualizations";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderUIControls } from "metabase-types/store";

interface LeftViewFooterButtonGroup {
  question: Question;
}

export const LeftViewFooterButtonGroup = ({
  question,
}: LeftViewFooterButtonGroup) => {
  const { isShowingChartSettingsSidebar }: QueryBuilderUIControls =
    useSelector(getUiControls);

  const dispatch = useDispatch();

  const vizIcon = getIconForVisualizationType(question.display());

  return (
    <Flex gap="0.75rem">
      {isShowingChartSettingsSidebar ? (
        <DoneButton onClick={() => dispatch(onCloseChartSettings())} />
      ) : (
        <VisualizationButton
          leftIcon={<Icon name={vizIcon} />}
          onClick={() => dispatch(onOpenChartSettings())}
        />
      )}
    </Flex>
  );
};

function VisualizationButton(props: ButtonProps) {
  return (
    <Button
      variant="default"
      pt={rem(7)}
      pb={rem(7)}
      styles={{
        root: {
          backgroundColor: "var(--mb-color-brand-lighter)",
          color: "var(--mb-color-brand)",
          border: 0,

          "&:hover": {
            backgroundColor: "var(--mb-color-focus)",
          },
        },
      }}
      data-testid="viz-settings-button"
      {...props}
    >
      {t`Visualization`}
    </Button>
  );
}

function DoneButton(props: ButtonProps) {
  return (
    <Button
      variant="filled"
      pt={rem(7)}
      pb={rem(7)}
      data-testid="viz-settings-done-button"
      {...props}
    >
      {t`Done`}
    </Button>
  );
}
