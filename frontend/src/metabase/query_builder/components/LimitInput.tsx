import { NumberInput, NumberInputProps } from "metabase/ui";

const DEFAULT_STYLE = {
  borderWidth: 2,
};

const LimitInput = ({ className, style = {}, ...props }: NumberInputProps) => (
  <NumberInput
    className={className}
    style={{ ...DEFAULT_STYLE, ...style }}
    px="sm"
    py="lg"
    {...props}
    type="number"
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LimitInput;
