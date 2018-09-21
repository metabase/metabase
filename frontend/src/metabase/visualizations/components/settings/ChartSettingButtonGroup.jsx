import React from "react";

import Icon from "metabase/components/Icon";
import ButtonGroup from "metabase/components/ButtonGroup";

const ChartSettingButtonGroup = ({ value, onChange, options, ...props }) => (
  <ButtonGroup
    {...props}
    value={value}
    onChange={onChange}
    options={options}
    optionNameFn={o => (o.icon ? <Icon name={o.icon} /> : o.name)}
  />
);

export default ChartSettingButtonGroup;
