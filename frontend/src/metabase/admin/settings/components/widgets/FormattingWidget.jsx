import React from "react";

import { TYPE } from "metabase/lib/types";

import ColumnSettings from "metabase/visualizations/components/ColumnSettings";

const SETTING_TYPES = [
  {
    name: "Dates and Times",
    type: TYPE.DateTime,
    settings: [
      "date_style",
      "date_separator",
      "date_abbreviate",
      // "time_enabled",
      "time_style",
    ],
    column: {
      special_type: TYPE.DateTime,
      unit: "second",
    },
  },
  {
    name: "Numbers",
    type: TYPE.Number,
    settings: ["number_separators"],
    column: {
      base_type: TYPE.Number,
      special_type: TYPE.Number,
    },
  },
  {
    name: "Currency",
    type: TYPE.Currency,
    settings: ["currency_style", "currency", "currency_in_header"],
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
      <div className="mt2">
        {SETTING_TYPES.map(({ type, name, column, settings }) => (
          <div
            className="border-bottom pb2 mb4 flex-full"
            style={{ minWidth: 400 }}
          >
            <h3 className="mb3">{name}</h3>
            <ColumnSettings
              value={value[type]}
              onChange={settings => onChange({ ...value, [type]: settings })}
              column={column}
              whitelist={new Set(settings)}
              noReset
            />
          </div>
        ))}
      </div>
    );
  }
}

export default FormattingWidget;
