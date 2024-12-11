/* eslint-disable react/prop-types */
import CS from "metabase/css/core/index.css";
import { Switch, Text } from "metabase/ui";

export const ChartSettingToggle = ({ value, onChange, id, title }) => (
  <Switch
    label={
      <Text truncate fw="bold">
        {title}
      </Text>
    }
    labelPosition="left"
    checked={value}
    onChange={e => onChange(e.currentTarget.checked)}
    id={id}
    w="100%"
    size="sm"
    classNames={{
      labelWrapper: CS.fullWidth,
    }}
  />
);
