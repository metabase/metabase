import { isValidElement } from "react";

import { useSetting } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/i18n/hooks";
import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import type { DashboardId, Parameter } from "metabase-types/api";

import RemappedValue from "./RemappedValue";

export const Value = ({
  value: rawValue,
  column,
  ...rawOptions
}: {
  value: unknown;
  displayValue?: unknown;
  hide?: boolean;
  autoLoad?: boolean;
  parameter?: Parameter;
  cardId?: number;
  dashboardId?: DashboardId;
  ignoreInstanceSettings?: boolean;
} & OptionsType) => {
  const tc = useTranslateContent<unknown>();
  const formattingSettings = useSetting("custom-formatting");

  if (rawOptions.hide) {
    return null;
  }

  const value = tc(rawValue);

  let options = {
    ...rawOptions,
    column,
    displayValue: tc(rawOptions.displayValue),
  };

  if (!options.ignoreInstanceSettings) {
    options = {
      ...options,
      ...formattingSettings?.["type/Number"],
      ...formattingSettings?.["type/Temporal"],
      ...formattingSettings?.["type/Currency"],
    };
  }

  options = {
    ...options,
    ...column?.settings,
  };

  if (rawOptions.remap) {
    return <RemappedValue value={value} {...options} />;
  }
  const formatted = formatValue(value, {
    ...options,
    jsx: true,
  });
  if (isValidElement(formatted)) {
    return formatted;
  } else {
    return <span>{formatted}</span>;
  }
};
