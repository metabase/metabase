import { t } from "ttag";

import ViewButton from "metabase/query_builder/components/view/ViewButton";
import { FooterButtonGroup } from "metabase/query_builder/components/view/ViewFooter.styled";

export type LeftViewFooterButtonGroupProps = {
  isShowingChartTypeSidebar: boolean;
  isShowingChartSettingsSidebar: boolean;
  onCloseChartType: () => void;
  onOpenChartType: () => void;
  onCloseChartSettings: () => void;
  onOpenChartSettings: () => void;
};
export const LeftViewFooterButtonGroup = ({
  isShowingChartTypeSidebar,
  isShowingChartSettingsSidebar,
  onCloseChartType,
  onOpenChartType,
  onCloseChartSettings,
  onOpenChartSettings,
}: LeftViewFooterButtonGroupProps) => (
    <FooterButtonGroup>
        <ViewButton
            medium
            labelBreakpoint="sm"
            data-testid="viz-type-button"
            active={isShowingChartTypeSidebar}
            onClick={
                isShowingChartTypeSidebar
                    ? () => onCloseChartType()
                    : () => onOpenChartType()
            }
        >
            {t`Visualization`}
        </ViewButton>
        <ViewButton
            active={isShowingChartSettingsSidebar}
            icon="gear"
            iconSize={16}
            medium
            onlyIcon
            labelBreakpoint="sm"
            data-testid="viz-settings-button"
            onClick={
                isShowingChartSettingsSidebar
                    ? () => onCloseChartSettings()
                    : () => onOpenChartSettings()
            }
        />
    </FooterButtonGroup>
)