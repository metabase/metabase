import { WidgetRoot } from "metabase/parameters/components/widgets/Widget.styled";

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
      <DateAllOptionsWidget
        setValue={setValue}
        onClose={onClose}
        disableOperatorSelection={disableOperatorSelection}
        value={value}
      />
    </WidgetRoot>
  );
};
