import { forwardRef } from "react";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onOpenChartSettings,
} from "metabase/query_builder/actions";
import {
  getIsShowingRawTable,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Button, Flex, rem } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderUIControls } from "metabase-types/store";

import { ViewFooterControl } from "./ViewFooterControl";

interface LeftViewFooterButtonGroupProps {
  question: Question;
  hideChartSettings?: boolean;
  isResultLoaded: boolean;
  isNotebook: boolean;
  isRunning: boolean;
}

// eslint-disable-next-line react/display-name
export const LeftViewFooterButtonGroup = forwardRef<HTMLDivElement, LeftViewFooterButtonGroupProps>(({
  question,
  hideChartSettings = false,
  isResultLoaded,
  isNotebook,
  isRunning,
}, ref) => {
  const { isShowingChartSettingsSidebar }: QueryBuilderUIControls =
    useSelector(getUiControls);
  const isShowingRawTable = useSelector(getIsShowingRawTable);

  const dispatch = useDispatch();

  const shouldShowChartSettingsButton =
    !isNotebook &&
    !hideChartSettings &&
    (!isShowingRawTable || isShowingChartSettingsSidebar) &&
    isResultLoaded;

  return (
    <Flex gap="0.75rem" ref={ref}>
      <ViewFooterControl
        question={question}
        isNotebook={isNotebook}
        isRunning={isRunning}
      />
      {shouldShowChartSettingsButton && (
        <Button
          variant={isShowingChartSettingsSidebar ? "filled" : "default"}
          radius="xl"
          pt={rem(7)}
          pb={rem(7)}
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
});
