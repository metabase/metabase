import ChartNestedSettingSeriesMultiple from "./ChartNestedSettingSeriesMultiple";
import ChartNestedSettingSeriesSingle, {
  ChartNestedSettingsSeriesSingleProps,
} from "./ChartNestedSettingSeriesSingle";

interface ChartNestedSettingSeriesProps
  extends ChartNestedSettingsSeriesSingleProps {
  isDashboard: boolean;
}

const ChartNestedSettingSeries = ({
  isDashboard,
  ...props
}: ChartNestedSettingSeriesProps) => {
  return isDashboard ? (
    <ChartNestedSettingSeriesMultiple {...props} />
  ) : (
    <ChartNestedSettingSeriesSingle {...props} />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartNestedSettingSeries;
