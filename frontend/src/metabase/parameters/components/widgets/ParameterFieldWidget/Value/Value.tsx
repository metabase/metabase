import { isValidElement } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type {
  ColumnSettings,
  DashboardId,
  Parameter,
} from "metabase-types/api";

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
} & ColumnSettings) => {
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
