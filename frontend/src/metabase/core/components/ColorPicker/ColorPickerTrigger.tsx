import { forwardRef, HTMLAttributes, Ref } from "react";
import ColorPill from "metabase/core/components/ColorPill";
import ColorInput from "metabase/core/components/ColorInput";
import { TriggerContainer } from "./ColorPicker.styled";

export interface ColorPickerTriggerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string;
  placeholder?: string;
  isAuto?: boolean;
  onChange?: (value?: string) => void;
}

const ColorPickerTrigger = forwardRef(function ColorPickerTrigger(
  {
    value,
    placeholder,
    isAuto,
    onClick,
    onChange,
    ...props
  }: ColorPickerTriggerProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TriggerContainer {...props} ref={ref}>
      <ColorPill color={value} isAuto={isAuto} onClick={onClick} />
      <ColorInput
        value={!isAuto ? value : undefined}
        placeholder={placeholder}
        fullWidth
        onChange={onChange}
      />
    </TriggerContainer>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPickerTrigger;
