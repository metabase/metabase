import { t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { useSetting } from "metabase/common/hooks";
import { ParameterFieldWidgetValue } from "metabase/parameters/components/widgets/ParameterFieldWidget/ParameterFieldWidgetValue/ParameterFieldWidgetValue";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import {
  getFields,
  hasFields,
  isFieldFilterUiParameter,
} from "metabase-lib/v1/parameters/utils/parameter-fields";
import {
  isBooleanParameter,
  isDateParameter,
  isStringParameter,
  isTemporalUnitParameter,
} from "metabase-lib/v1/parameters/utils/parameter-type";
import { parameterHasNoDisplayValue } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  CardId,
  DashboardId,
  ParameterValue,
  RowValue,
} from "metabase-types/api";
import type { EntityToken } from "metabase-types/api/entity";

export type FormattedParameterValueProps = {
  parameter: UiParameter;
  value: string | number | number[] | ParameterValue;
  cardId?: CardId;
  dashboardId?: DashboardId;
  token?: EntityToken | null;
  placeholder?: string;
  isPopoverOpen?: boolean;
  dataTestId?: string;
};

function FormattedParameterValue({
  parameter,
  value,
  cardId,
  dashboardId,
  token,
  placeholder,
  isPopoverOpen = false,
}: FormattedParameterValueProps) {
  const formattingSettings = useSetting("custom-formatting");

  if (parameterHasNoDisplayValue(value)) {
    return placeholder;
  }

  const first = getValue(value);
  const values = parameter?.values_source_config?.values;
  const displayValue = values?.find(
    (value) => getValue(value)?.toString() === first?.toString(),
  );

  const label = !isBooleanParameter(parameter)
    ? getLabel(displayValue)
    : getBooleanLabel(first as boolean);

  const renderContent = () => {
    if (
      isFieldFilterUiParameter(parameter) &&
      hasFields(parameter) &&
      !isDateParameter(parameter) &&
      !isTemporalUnitParameter(parameter)
    ) {
      return (
        <ParameterFieldWidgetValue
          fields={getFields(parameter)}
          value={value}
          parameter={parameter}
          cardId={cardId}
          dashboardId={dashboardId}
          token={token}
          displayValue={label}
        />
      );
    }

    if (label) {
      return (
        <span>
          {formatParameterValue(label, parameter, formattingSettings)}
        </span>
      );
    }

    return (
      <span>{formatParameterValue(value, parameter, formattingSettings)}</span>
    );
  };

  if (isStringParameter(parameter) || isDateParameter(parameter)) {
    const hasLongValue = typeof first === "string" && first.length > 80;
    return (
      <Ellipsified
        showTooltip={!isPopoverOpen}
        multiline
        tooltipMaxWidth={hasLongValue ? 450 : undefined}
      >
        {renderContent()}
      </Ellipsified>
    );
  }

  return renderContent();
}

function getValue(
  value: string | number | number[] | ParameterValue | undefined,
): RowValue | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value?.toString();
}

function getLabel(
  value: boolean | string | ParameterValue | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[1];
  }
  return value?.toString();
}

function getBooleanLabel(value: boolean) {
  return value ? t`True` : t`False`;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormattedParameterValue;
