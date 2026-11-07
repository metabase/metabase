import type { ReactNode } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import { formatValue } from "metabase/value-formatting";
import * as Lib from "metabase-lib";
import { getFieldTypeInfo } from "metabase-lib/v1/parameters/utils/parameter-fields";
import type { ParameterFieldInfo } from "metabase-types/api";

import AutoLoadRemapped from "./Remapped";

type RenderNormal = (opts: {
  value?: unknown;
  column?: ParameterFieldInfo;
}) => ReactNode;
type RenderRemapped = (opts: {
  value: unknown;
  column?: ParameterFieldInfo;
  displayValue?: unknown;
}) => ReactNode;

export type RemappedValueProps = {
  value: unknown;
  column?: ParameterFieldInfo;
  displayValue?: unknown;
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
    {column != null && Lib.isID(getFieldTypeInfo(column)) && (
      <span style={{ opacity: 0.5 }}>{" - " + value}</span>
    )}
  </span>
);

const RemappedValueContent = ({
  value,
  column,
  displayValue,
  renderNormal = defaultRenderNormal,
  renderRemapped = defaultRenderRemapped,
  ...props
}: Omit<RemappedValueProps, "autoLoad">) => {
  const tc = useTranslateContent();
  const effectiveValue = getEffectiveValue(value, column, props);
  const effectiveDisplayValue = tc(displayValue);
  if (effectiveDisplayValue != null) {
    return renderRemapped({
      value: effectiveValue,
      displayValue: effectiveDisplayValue,
      column,
    });
  } else {
    return renderNormal({ value: effectiveValue, column });
  }
};

const getEffectiveValue = (
  value: unknown,
  column: ParameterFieldInfo | undefined,
  props: object,
) =>
  column != null
    ? formatValue(value, { ...props, column, jsx: true, remap: false })
    : value;

export const AutoLoadRemappedValue = AutoLoadRemapped(RemappedValueContent);

export const FieldRemappedValue = (props: RemappedValueProps) => (
  <RemappedValueContent {...props} />
);

const RemappedValue = ({ autoLoad = true, ...props }: RemappedValueProps) =>
  autoLoad && !props.displayValue ? (
    <AutoLoadRemappedValue {...props} />
  ) : (
    <FieldRemappedValue {...props} />
  );

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RemappedValue;
