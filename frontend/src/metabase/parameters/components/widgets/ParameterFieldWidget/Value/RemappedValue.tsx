import type { ReactNode } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import AutoLoadRemapped from "metabase/hoc/Remapped";
import { getRemappedFieldValue } from "metabase/metadata-store";
import { useSelector } from "metabase/redux";
import { formatValue } from "metabase/value-formatting";
import type { ParameterField } from "metabase-lib/v1/parameters/types";
import { isID } from "metabase-lib/v1/types/utils/isa";

type RenderNormal = (opts: {
  value?: unknown;
  column?: ParameterField;
}) => ReactNode;
type RenderRemapped = (opts: {
  value: unknown;
  column?: ParameterField;
  displayValue?: unknown;
  displayColumn?: ParameterField;
}) => ReactNode;

export type RemappedValueProps = {
  value: unknown;
  column?: ParameterField;
  displayValue?: unknown;
  displayColumn?: ParameterField;
  renderNormal?: RenderNormal;
  renderRemapped?: RenderRemapped;
  autoLoad?: boolean;
};

// Unjustified type cast. FIXME
const defaultRenderNormal: RenderNormal = ({ value }) => (
  <span>{value as ReactNode}</span>
);

const defaultRenderRemapped: RenderRemapped = ({
  value,
  displayValue,
  column,
}) => (
  <span>
    {/* Unjustified type cast. FIXME */}
    <span className={CS.textBold}>{displayValue as ReactNode}</span>
    {/* Show the underlying ID for PK/FK */}
    {isID(column) && <span style={{ opacity: 0.5 }}>{" - " + value}</span>}
  </span>
);

const RemappedValueContent = ({
  value,
  column,
  displayValue,
  displayColumn,
  renderNormal = defaultRenderNormal,
  renderRemapped = defaultRenderRemapped,
  ...props
}: Omit<RemappedValueProps, "autoLoad">) => {
  const tc = useTranslateContent();
  const effectiveValue = getEffectiveValue(value, column, props);
  const effectiveDisplayValue = getEffectiveDisplayValue(
    tc(displayValue),
    displayColumn,
    props,
  );
  if (effectiveDisplayValue != null) {
    return renderRemapped({
      value: effectiveValue,
      displayValue: effectiveDisplayValue,
      column,
      displayColumn,
    });
  } else {
    return renderNormal({ value: effectiveValue, column });
  }
};

const getEffectiveValue = (
  value: unknown,
  column: ParameterField | undefined,
  props: object,
) =>
  column != null
    ? formatValue(value, { ...props, column, jsx: true, remap: false })
    : value;

const getEffectiveDisplayValue = (
  displayValue: unknown,
  displayColumn: ParameterField | undefined,
  props: object,
) =>
  displayColumn != null
    ? formatValue(displayValue, {
        ...props,
        column: displayColumn,
        jsx: true,
        remap: false,
      })
    : displayValue;

export const AutoLoadRemappedValue = AutoLoadRemapped(RemappedValueContent);

export const FieldRemappedValue = (props: RemappedValueProps) => {
  const remappedValue = useRemappedValue(props.column, props.value);

  return (
    <RemappedValueContent
      {...props}
      displayValue={props.displayValue ?? remappedValue}
    />
  );
};

function useRemappedValue(column: ParameterField | undefined, value: unknown) {
  return useSelector((state) =>
    column == null ? undefined : getRemappedFieldValue(state, column, value),
  );
}

const RemappedValue = ({ autoLoad = true, ...props }: RemappedValueProps) =>
  autoLoad && !props.displayValue ? (
    <AutoLoadRemappedValue {...props} />
  ) : (
    <FieldRemappedValue {...props} />
  );

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RemappedValue;
