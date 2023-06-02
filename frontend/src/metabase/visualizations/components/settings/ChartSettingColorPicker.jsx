/* eslint-disable react/prop-types */
import cx from "classnames";

import { getAccentColors } from "metabase/lib/colors/groups";
import ColorSelector from "metabase/core/components/ColorSelector";

export default function ChartSettingColorPicker(props) {
  const { value, onChange, className, pillSize } = props;

  return (
    <div className={cx("flex align-center mb1", className)}>
      <ColorSelector
        value={value}
        colors={getAccentColors()}
        onChange={onChange}
        pillSize={pillSize}
      />
      {props.title && <h4 className="ml1">{props.title}</h4>}
    </div>
  );
}
