import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import AutoLoadRemapped from "metabase/hoc/Remapped";
import { useTranslateContent } from "metabase/i18n/hooks";
import { formatValue } from "metabase/visualizations/lib/formatting";
import type Field from "metabase-lib/v1/metadata/Field";

type RenderNormal = (opts: { value?: unknown; column?: Field }) => ReactNode;
type RenderRemapped = (opts: {
  value: unknown;
  column?: Field;
  displayValue?: unknown;
  displayColumn?: Field;
}) => ReactNode;

export type RemappedValueProps = {
  value: unknown;
  column?: Field;
  displayValue?: unknown;
  displayColumn?: Field;
  renderNormal?: RenderNormal;
  renderRemapped?: RenderRemapped;
  autoLoad?: boolean;
};

const defaultRenderNormal: RenderNormal = ({ value }) => (
  <span>{value as ReactNode}</span>
);

const defaultRenderRemapped: RenderRemapped = ({
  value,
  displayValue,
  column,
}) => (
  <span>
    <span className={CS.textBold}>{displayValue as ReactNode}</span>
    {/* Show the underlying ID for PK/FK */}
    {column?.isID() && <span style={{ opacity: 0.5 }}>{" - " + value}</span>}
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
  column: Field | undefined,
  props: object,
) =>
  column != null
    ? formatValue(value, { ...props, column, jsx: true, remap: false })
    : value;

const getEffectiveDisplayValue = (
  displayValue: unknown,
  displayColumn: Field | undefined,
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

export const FieldRemappedValue = (props: RemappedValueProps) => (
  <RemappedValueContent
    {...props}
    displayValue={
      props.displayValue ?? props.column?.remappedValue(props.value)
    }
  />
);

const RemappedValue = ({ autoLoad = true, ...props }: RemappedValueProps) =>
  autoLoad && !props.displayValue ? (
    <AutoLoadRemappedValue {...props} />
  ) : (
    <FieldRemappedValue {...props} />
  );

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RemappedValue;
