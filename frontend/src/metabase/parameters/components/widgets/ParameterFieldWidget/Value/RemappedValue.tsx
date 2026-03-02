import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import AutoLoadRemapped from "metabase/hoc/Remapped";
import { formatValue } from "metabase/lib/formatting";
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
  displayValue: unknown;
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
  if (column != null) {
    value = formatValue(value, {
      ...props,
      column,
      jsx: true,
      remap: false,
    });
  }
  if (displayColumn != null) {
    displayValue = formatValue(displayValue, {
      ...props,
      column: displayColumn,
      jsx: true,
      remap: false,
    });
  }
  if (displayValue != null) {
    return renderRemapped({ value, displayValue, column, displayColumn });
  } else {
    return renderNormal({ value, column });
  }
};

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

// test version doesn't use metabase/hoc/Remapped which requires a redux store
export const TestRemappedValue = RemappedValueContent;
