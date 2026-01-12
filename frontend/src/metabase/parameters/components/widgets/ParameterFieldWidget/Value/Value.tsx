import { isValidElement } from "react";

import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { useTranslateContent } from "metabase/i18n/hooks";
import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import type { DashboardId, Parameter } from "metabase-types/api";

import RemappedValue from "./RemappedValue";

export const Value = ({
  value: rawValue,
  ...rawOptions
}: {
  value: unknown;
  displayValue?: unknown;
  hide?: boolean;
  autoLoad?: boolean;
  parameter?: Parameter;
  cardId?: number;
  dashboardId?: DashboardId;
} & OptionsType) => {
  const tc = useTranslateContent<unknown>();
  const { uuid, token } = useEmbeddingEntityContext();

  if (rawOptions.hide) {
    return null;
  }

  const value = tc(rawValue);

  const options = {
    ...rawOptions,
    uuid,
    token,
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
