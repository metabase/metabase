import React from "react";
import { t } from "ttag";

import { TYPE } from "metabase/lib/types";

import MetabaseSettings from "metabase/lib/settings";
import ColumnSettings from "metabase/visualizations/components/ColumnSettings";
import SettingsSetting from "metabase/admin/settings/components/SettingsSetting";

const SETTING_TYPES = [
  {
    name: t`Dates and Times`,
    type: TYPE.Temporal,
    settings: [
      "date_style",
      "date_separator",
      "date_abbreviate",
      // "time_enabled",
      "time_style",
    ],
    column: {
      special_type: TYPE.Temporal,
      unit: "second",
    },
  },
  {
    name: t`Numbers`,
    type: TYPE.Number,
    settings: ["number_separators"],
    column: {
      base_type: TYPE.Number,
      special_type: TYPE.Number,
    },
  },
  {
    name: t`Currency`,
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
        <div className="border-bottom pb2 mb4">
          <h3>{t`Instance language`}</h3>
          <p className="text-measure">{t`The language that should be used for Metabase's UI, system emails, pulses, and alerts. This is also the default language for all users, which they can change from their own account settings.`}</p>

          <SettingsSetting
            setting={{
              key: "site-locale",
              type: "select",
              options: (MetabaseSettings.get("available-locales") || []).map(
                ([value, name]) => ({ name, value }),
              ),
              defaultValue: "en",
            }}
            onChange={val => {
              // TODO - this needs to actually change the val
              onChange(val);
            }}
          />
        </div>
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
