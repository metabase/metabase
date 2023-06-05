import moment from "moment-timezone";
import DateAllOptionsWidget from "metabase/components/DateAllOptionsWidget";

interface DateRangeWidgetProps {
  setValue: (value: string | null) => void;
  value?: string;
  onClose: () => void;
}

const DateRangeWidget = ({ value, ...props }: DateRangeWidgetProps) => {
  const defaultedValue =
    value == null
      ? `${moment().format("YYYY-MM-DD")}~${moment().format("YYYY-MM-DD")}`
      : value;

  return (
    <DateAllOptionsWidget
      {...props}
      value={defaultedValue}
      disableOperatorSelection
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateRangeWidget;
