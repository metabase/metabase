import { renderNumberOfSelections } from "metabase/parameters/utils/formatting";
import type Field from "metabase-lib/v1/metadata/Field";
import type { CardId, DashboardId, Parameter } from "metabase-types/api";

import Value from "../Value";
import { normalizeValue } from "../normalizeValue";

type ParameterFieldWidgetValueProps = {
  value: unknown;
  fields: Field[];
  parameter: Parameter;
  cardId?: CardId;
  dashboardId?: DashboardId;
  displayValue?: string;
};

export function ParameterFieldWidgetValue({
  value,
  fields,
  parameter,
  cardId,
  dashboardId,
  displayValue,
}: ParameterFieldWidgetValueProps) {
  const values = normalizeValue(value);

  const numberOfValues = values.length;

  // If there are multiple fields, turn off remapping since they might
  // be remapped to different fields.
  const shouldRemap = fields.length === 1;

  return numberOfValues > 1 ? (
    <>{renderNumberOfSelections(numberOfValues)}</>
  ) : (
    <Value
      remap={shouldRemap}
      value={values[0]}
      column={fields[0]}
      parameter={parameter}
      cardId={cardId}
      dashboardId={dashboardId}
      displayValue={displayValue}
    />
  );
}
