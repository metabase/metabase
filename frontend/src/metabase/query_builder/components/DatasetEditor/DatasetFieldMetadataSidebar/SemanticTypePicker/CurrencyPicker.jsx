import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import Select, { Option } from "metabase/components/Select";

import { getGlobalSettingsForColumn } from "metabase/visualizations/lib/settings/column";
import { currency } from "cljs/metabase.shared.util.currency";

import { OptionContent, CurrencySymbol } from "./CurrencyPicker.styled";

const propTypes = {
  field: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
};

function getCurrency(field) {
  return (
    field?.settings?.currency ||
    getGlobalSettingsForColumn(field).currency ||
    "USD"
  );
}

function CurrencyPicker({ field, onChange }) {
  const value = useMemo(() => getCurrency(field), [field]);

  return (
    <Select
      placeholder={t`Select a currency type`}
      value={value}
      onChange={onChange}
      searchProp="name"
      searchCaseSensitive={false}
    >
      {currency.map(([, c]) => (
        <Option name={c.name} value={c.code} key={c.code}>
          <OptionContent>
            <span>{c.name}</span>
            <CurrencySymbol>{c.symbol}</CurrencySymbol>
          </OptionContent>
        </Option>
      ))}
    </Select>
  );
}

CurrencyPicker.propTypes = propTypes;

export default CurrencyPicker;
