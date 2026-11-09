import { isValidElement } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import { useEmbeddingEntityContext } from "metabase/embedding/context";
import { formatValue } from "metabase/value-formatting";
import type * as Lib from "metabase-lib";
import { getParameterFieldFormatColumn } from "metabase-lib/v1/parameters/utils/parameter-fields";
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
  field?: Lib.ParameterFieldInfo;
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
  const { field, ...formatOptions } = options;
  const formatted = formatValue(value, {
    ...formatOptions,
    column:
      formatOptions.column ??
      (field != null ? getParameterFieldFormatColumn(field) : undefined),
    jsx: true,
  });
  if (isValidElement(formatted)) {
    return formatted;
  } else {
    return <span>{formatted}</span>;
  }
};
