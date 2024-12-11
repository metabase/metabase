/* eslint-disable react/prop-types */
import { Switch } from "metabase/ui";

export const ChartSettingToggle = ({ value, onChange, id, title }) => (
  <Switch
    label={title}
    labelPosition="left"
    checked={value}
    onChange={e => onChange(e.currentTarget.checked)}
    id={id}
  />
);
