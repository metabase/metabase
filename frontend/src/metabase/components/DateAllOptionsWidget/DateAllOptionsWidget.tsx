import { WidgetRoot } from "metabase/parameters/components/widgets/Widget.styled";
import { DateAllOptions } from "metabase/components/DateAllOptions";

interface DateAllOptionsWidgetProps {
  setValue: (value: string | null) => void;
  value?: string;
  onClose: () => void;
  disableOperatorSelection?: boolean;
}

export const DateAllOptionsWidget = ({
  setValue,
  onClose,
  disableOperatorSelection,
  value,
}: DateAllOptionsWidgetProps) => {
  return (
    <WidgetRoot>
      <DateAllOptions
        setValue={setValue}
        onClose={onClose}
        disableOperatorSelection={disableOperatorSelection}
        value={value}
      />
    </WidgetRoot>
  );
};
