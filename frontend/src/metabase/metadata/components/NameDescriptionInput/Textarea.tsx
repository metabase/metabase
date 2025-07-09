import { TextareaBlurChange, type TextareaBlurChangeProps } from "metabase/ui";

interface Props
  extends Omit<
    TextareaBlurChangeProps,
    "normalize" | "value" | "onBlurChange" | "onChange"
  > {
  normalize?: (
    value: string | number | readonly string[] | undefined,
  ) => string;
  value: string;
  onChange: (value: string) => void;
}

export const Textarea = ({
  normalize,
  required,
  value,
  onChange,
  ...props
}: Props) => {
  return (
    <TextareaBlurChange
      normalize={normalize}
      required={required}
      resetOnEsc
      value={value}
      onBlurChange={(event) => {
        const newValue = event.target.value;
        const newNormalizedValue = normalize ? normalize(newValue) : newValue;

        if (newNormalizedValue !== value) {
          onChange(event.target.value);
        }
      }}
      {...props}
    />
  );
};
