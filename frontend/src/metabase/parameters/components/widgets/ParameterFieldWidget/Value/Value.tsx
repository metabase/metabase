/* eslint-disable react/prop-types */
import { isValidElement } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";

import RemappedValue from "./RemappedValue";

export const Value = ({
  value: rawValue,
  ...rawOptions
}: {
  value: unknown;
  displayValue?: unknown;
  hide?: boolean;
} & OptionsType) => {
  const tc = useTranslateContent<unknown>();

  if (rawOptions.hide) {
    return null;
  }

  const value = tc(rawValue);

  const options = {
    ...rawOptions,
    displayValue: tc(rawOptions.displayValue),
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
