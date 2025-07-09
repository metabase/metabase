import {
  TextInputBlurChange,
  type TextInputBlurChangeProps,
} from "metabase/ui";

interface Props
  extends Omit<
    TextInputBlurChangeProps,
    "normalize" | "value" | "onBlurChange" | "onChange"
  > {
  normalize?: (
    value: string | number | readonly string[] | undefined,
  ) => string;
  value: string;
  onChange: (value: string) => void;
}

export const Input = ({
  normalize,
  required,
  value,
  onChange,
  ...props
}: Props) => {
  return (
    <TextInputBlurChange
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
