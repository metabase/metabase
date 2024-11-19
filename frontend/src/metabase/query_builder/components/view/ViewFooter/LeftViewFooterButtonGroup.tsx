import { useUnmount } from "react-use";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  onCloseChartSettings,
  onOpenChartSettings,
  setUIControls,
} from "metabase/query_builder/actions";
import {
  getIsShowingRawTable,
  getIsVisualized,
  getUiControls,
} from "metabase/query_builder/selectors";
import { Button, Flex } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { QueryBuilderUIControls } from "metabase-types/store";

import { ViewFooterControl } from "./ViewFooterViewControl";

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

  const dispatch = useDispatch();

  useUnmount(() => {
    // reset showing raw table, so new mount will default to viz
    dispatch(setUIControls({ isShowingRawTable: false }));
  });

  const isVisualized = useSelector(getIsVisualized);
  const shouldShowChartSettingsButton =
    !hideChartSettings && (!isShowingRawTable || isVisualized);

  return (
    <Flex gap="0.75rem">
      <ViewFooterControl question={question} />
      {shouldShowChartSettingsButton && (
        <Button
          variant={isShowingChartSettingsSidebar ? "filled" : "default"}
          radius="xl"
          /* mah is a hack for 32px height button, we don't have it atm */
          mah="xl"
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
};
