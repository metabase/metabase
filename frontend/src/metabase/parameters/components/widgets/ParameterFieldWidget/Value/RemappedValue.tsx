import type { ReactNode } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import { formatValue } from "metabase/value-formatting";
import type * as Lib from "metabase-lib";
import { getParameterFieldFormatColumn } from "metabase-lib/v1/parameters/utils/parameter-fields";

import AutoLoadRemapped from "./Remapped";

type RenderNormal = (opts: {
  value?: unknown;
  field?: Lib.ParameterFieldInfo;
}) => ReactNode;
type RenderRemapped = (opts: {
  value: unknown;
  field?: Lib.ParameterFieldInfo;
  displayValue?: unknown;
}) => ReactNode;

export type RemappedValueProps = {
  value: unknown;
  field?: Lib.ParameterFieldInfo;
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
  field,
}) => (
  <span>
    {/* Unjustified type cast. FIXME */}
    <span className={CS.textBold}>{displayValue as ReactNode}</span>
    {/* Show the underlying ID for PK/FK */}
    {field != null && !field.isString && (
      <span style={{ opacity: 0.5 }}>{" - " + value}</span>
    )}
  </span>
);

const RemappedValueContent = ({
  value,
  field,
  displayValue,
  renderNormal = defaultRenderNormal,
  renderRemapped = defaultRenderRemapped,
  ...props
}: Omit<RemappedValueProps, "autoLoad">) => {
  const tc = useTranslateContent();
  const effectiveValue = formatValue(value, {
    ...props,
    column: field != null ? getParameterFieldFormatColumn(field) : undefined,
    jsx: true,
    remap: false,
  });
  const effectiveDisplayValue = tc(displayValue);
  if (effectiveDisplayValue != null) {
    return renderRemapped({
      value: effectiveValue,
      displayValue: effectiveDisplayValue,
      field,
    });
  } else {
    return renderNormal({ value: effectiveValue, field });
  }
};

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
