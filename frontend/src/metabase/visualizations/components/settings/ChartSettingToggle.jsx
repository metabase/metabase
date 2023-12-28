/* eslint-disable react/prop-types */
import Toggle from "metabase/core/components/Toggle";

const ChartSettingToggle = ({ value, onChange, id }) => (
  <Toggle value={value} onChange={onChange} id={id} />
);

export default ChartSettingToggle;
