import _ from "underscore";

import InputBlurChange from "metabase/components/InputBlurChange";

interface ChartSettingInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

const ChartSettingInput = ({
  value,
  onChange,
  ...props
}: ChartSettingInputProps) => (
  <InputBlurChange
    {..._.omit(props, "onChangeSettings")}
    data-testid={props.id}
    value={value}
    onBlurChange={e => onChange(e.target.value)}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingInput;
