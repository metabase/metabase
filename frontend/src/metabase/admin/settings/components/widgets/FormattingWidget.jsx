import React from "react";

import { TYPE } from "metabase/lib/types";

import ColumnSettings from "metabase/visualizations/components/ColumnSettings";

const SETTING_TYPES = [
  {
    name: "Date and Time",
    type: TYPE.DateTime,
    settings: ["date_style", "date_abbreviate", "time_style"],
    column: {
      special_type: TYPE.DateTime,
      unit: "second",
    },
  },
  {
    name: "Number",
    type: TYPE.Number,
    settings: ["locale"],
    column: {
      base_type: TYPE.Number,
      special_type: TYPE.Number,
    },
  },
  {
    name: "Currency",
    type: TYPE.Currency,
    settings: ["currency_style", "currency"],
    column: {
      base_type: TYPE.Number,
      special_type: TYPE.Currency,
    },
  },
];

class FormattingWidget extends React.Component {
  render() {
    const { setting, onChange } = this.props;
    const value = setting.value || setting.default;
    return (
      <div className="flex mt2">
        {SETTING_TYPES.map(({ type, name, column, settings }) => (
          <div className="border-column-divider pr4 mr4">
            <h3 className="mb2">{name}</h3>
            <ColumnSettings
              value={value[type]}
              onChange={settings => onChange({ ...value, [type]: settings })}
              column={column}
              settings={settings}
            />
          </div>
        ))}
      </div>
    );
  }
}

export default FormattingWidget;
